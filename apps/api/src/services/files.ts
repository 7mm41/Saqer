/** Uploads (§13): allow-list, magic bytes, re-encode images, strip metadata, encrypt, signed URLs. */
import sharp from 'sharp';
import exifr from 'exifr';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Ctx } from '../ctx';
import { files } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { newId } from '../lib/ids';

const run = promisify(execFile);

export type Purpose =
  | 'booking_problem'
  | 'arrival'
  | 'diagnosis'
  | 'before'
  | 'after'
  | 'receipt'
  | 'profile_photo'
  | 'work_sample'
  | 'document'
  | 'signature'
  | 'dispute'
  | 'certification'
  | 'branding';

const SENSITIVE: Purpose[] = ['document', 'signature'];
const IMAGE_MAX = 15 * 1024 * 1024;
const VIDEO_MAX = 25 * 1024 * 1024;
const VIDEO_PURPOSES: Purpose[] = ['booking_problem', 'dispute'];

export function sniff(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'mp4' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return 'mp4';
  return null;
}

async function processVideo(buf: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'katf-'));
  try {
    const inp = join(dir, 'in');
    const out = join(dir, 'out.mp4');
    await writeFile(inp, buf);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', inp], { timeout: 20_000 });
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration > 31) throw badRequest('video_too_long');
    await run('ffmpeg', ['-y', '-v', 'error', '-i', inp, '-map_metadata', '-1', '-map_chapters', '-1', '-c', 'copy', '-movflags', '+faststart', out], { timeout: 60_000 });
    return await readFile(out);
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') throw badRequest('video_unsupported');
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function storeUpload(
  ctx: Ctx,
  i: { buffer: Buffer; purpose: Purpose; ownerId: string | null; isPublic?: boolean },
): Promise<{ id: string; kind: string; mime: string }> {
  const type = sniff(i.buffer);
  if (!type) throw badRequest('file_type');
  let out: Buffer;
  let mime: string;
  let kind: 'image' | 'video' | 'signature';
  let captureMetaEnc: string | null = null;
  if (type === 'mp4') {
    if (!VIDEO_PURPOSES.includes(i.purpose)) throw badRequest('file_type');
    if (i.buffer.length > VIDEO_MAX) throw badRequest('file_size');
    out = await processVideo(i.buffer);
    mime = 'video/mp4';
    kind = 'video';
  } else {
    if (i.buffer.length > IMAGE_MAX) throw badRequest('file_size');
    try {
      const meta = (await exifr.parse(i.buffer, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] }).catch(() => null)) as
        | { DateTimeOriginal?: Date; CreateDate?: Date; latitude?: number; longitude?: number }
        | null;
      if (meta && (meta.DateTimeOriginal || meta.latitude != null))
        captureMetaEnc = ctx.crypto.encryptJson({ takenAt: (meta.DateTimeOriginal ?? meta.CreateDate)?.toISOString?.() ?? null, lat: meta.latitude ?? null, lng: meta.longitude ?? null });
    } catch {
      /* metadata is optional */
    }
    const img = sharp(i.buffer, { failOn: 'error' }).rotate();
    if (i.purpose === 'signature' || type === 'png') {
      out = await img.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      mime = 'image/png';
    } else {
      out = await img.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      mime = 'image/jpeg';
    }
    kind = i.purpose === 'signature' ? 'signature' : 'image';
  }
  const id = newId();
  const storageKey = newId();
  await ctx.storage.put(storageKey, out);
  await ctx.db.insert(files).values({
    id,
    ownerUserId: i.ownerId,
    purpose: i.purpose,
    kind,
    mime,
    size: out.length,
    sha256: sha256(out),
    storageKey,
    sensitive: SENSITIVE.includes(i.purpose),
    public: i.isPublic ?? false,
    captureMetaEnc,
  });
  return { id, kind, mime };
}

export function signedFileUrl(ctx: Ctx, fileId: string, ttlSeconds = 300): string {
  const exp = Math.floor(ctx.clock.now() / 1000) + ttlSeconds;
  const sig = ctx.crypto.sign(`file:${fileId}:${exp}`, 'url');
  return `${ctx.config.API_PUBLIC_URL}/api/files/${fileId}?exp=${exp}&sig=${sig}`;
}

export async function readSignedFile(ctx: Ctx, fileId: string, exp: string, sig: string) {
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < ctx.clock.now()) throw forbidden();
  if (!ctx.crypto.verify(`file:${fileId}:${exp}`, sig, 'url')) throw forbidden();
  const r = await ctx.db.select().from(files).where(eq(files.id, fileId));
  const f = r[0];
  if (!f) throw notFound();
  return { mime: f.mime, data: await ctx.storage.get(f.storageKey) };
}

export async function fileOwner(ctx: Ctx, fileId: string) {
  const r = await ctx.db.select({ owner: files.ownerUserId, purpose: files.purpose, sensitive: files.sensitive }).from(files).where(eq(files.id, fileId));
  return r[0] ?? null;
}

export async function captureMeta(ctx: Ctx, fileId: string, db: import('../db').DbOrTx = ctx.db) {
  const r = await db.select({ m: files.captureMetaEnc }).from(files).where(eq(files.id, fileId));
  return ctx.crypto.decryptJson<{ takenAt: string | null; lat: number | null; lng: number | null }>(r[0]?.m ?? null);
}
