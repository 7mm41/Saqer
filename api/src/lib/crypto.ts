/**
 * Field encryption (AES-256-GCM) and blind indexes (HMAC-SHA256), with keys derived
 * by HKDF from DATA_KEY. Ciphertext format: "v1.<keyId>.<base64(iv|tag|ciphertext)>".
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Keys {
  keyId: string;
  enc: Buffer;
  idx: Buffer;
  ip: Buffer;
  token: Buffer;
  url: Buffer;
  file: Buffer;
  previous: { keyId: string; enc: Buffer; file: Buffer; idx: Buffer } | null;
}

function derive(root: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', root, Buffer.from('katf-v1'), Buffer.from(info), 32));
}

const keyIdOf = (root: Buffer) => createHash('sha256').update(root).digest('hex').slice(0, 8);

export function deriveKeys(root: Buffer, previous: Buffer | null = null): Keys {
  return {
    keyId: keyIdOf(root),
    enc: derive(root, 'field-encryption'),
    idx: derive(root, 'blind-index'),
    ip: derive(root, 'ip-hash'),
    token: derive(root, 'access-token'),
    url: derive(root, 'signed-url'),
    file: derive(root, 'file-encryption'),
    previous: previous ? { keyId: keyIdOf(previous), enc: derive(previous, 'field-encryption'), file: derive(previous, 'file-encryption'), idx: derive(previous, 'blind-index') } : null,
  };
}

export class Crypto {
  constructor(readonly keys: Keys) {}

  encrypt(plain: string): string;
  encrypt(plain: string | null | undefined): string | null;
  encrypt(plain: string | null | undefined): string | null {
    if (plain == null) return null;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.keys.enc, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${this.keys.keyId}.${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`;
  }

  decrypt(blob: string): string;
  decrypt(blob: string | null | undefined): string | null;
  decrypt(blob: string | null | undefined): string | null {
    if (blob == null) return null;
    const [v, keyId, data] = blob.split('.');
    if (v !== 'v1' || !keyId || !data) throw new Error('bad ciphertext');
    const key = keyId === this.keys.keyId ? this.keys.enc : keyId === this.keys.previous?.keyId ? this.keys.previous.enc : null;
    if (!key) throw new Error('ciphertext key not available');
    const raw = Buffer.from(data, 'base64');
    const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  }

  encryptJson(v: unknown): string {
    return this.encrypt(JSON.stringify(v));
  }

  decryptJson<T>(blob: string | null | undefined): T | null {
    const s = this.decrypt(blob);
    return s == null ? null : (JSON.parse(s) as T);
  }

  /** Bytes for files at rest. Format: keyId(8 ascii) | iv(12) | tag(16) | ciphertext */
  encryptBytes(buf: Buffer): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.keys.file, iv);
    const ct = Buffer.concat([c.update(buf), c.final()]);
    return Buffer.concat([Buffer.from(this.keys.keyId, 'ascii'), iv, c.getAuthTag(), ct]);
  }

  decryptBytes(buf: Buffer): Buffer {
    const keyId = buf.subarray(0, 8).toString('ascii');
    const key = keyId === this.keys.keyId ? this.keys.file : keyId === this.keys.previous?.keyId ? this.keys.previous.file : null;
    if (!key) throw new Error('file key not available');
    const d = createDecipheriv('aes-256-gcm', key, buf.subarray(8, 20));
    d.setAuthTag(buf.subarray(20, 36));
    return Buffer.concat([d.update(buf.subarray(36)), d.final()]);
  }

  /** Equality lookups on encrypted fields. */
  blindIndex(kind: string, value: string): string {
    return createHmac('sha256', this.keys.idx).update(`${kind}:${value.trim().toLowerCase()}`).digest('hex').slice(0, 40);
  }

  /** The same index under DATA_KEY_PREVIOUS (key rotation only). */
  previousBlindIndex(kind: string, value: string): string | null {
    if (!this.keys.previous) return null;
    return createHmac('sha256', this.keys.previous.idx).update(`${kind}:${value.trim().toLowerCase()}`).digest('hex').slice(0, 40);
  }

  /** Re-encrypt a field under the current key (reads values under either key). */
  reencrypt(value: string | null | undefined): string | null {
    if (value == null) return null;
    return this.encrypt(this.decrypt(value)!);
  }

  hashIp(ip: string | undefined | null): string | null {
    if (!ip) return null;
    return createHmac('sha256', this.keys.ip).update(ip).digest('hex').slice(0, 24);
  }

  sign(payload: string, purpose: 'token' | 'url' = 'token'): string {
    return createHmac('sha256', purpose === 'token' ? this.keys.token : this.keys.url).update(payload).digest('base64url');
  }

  verify(payload: string, signature: string, purpose: 'token' | 'url' = 'token'): boolean {
    return safeEqual(this.sign(payload, purpose), signature);
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
