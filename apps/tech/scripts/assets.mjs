// Renders the app icons (PWA + iPhone), the iPhone splash and the new-request alert sound from code,
// so they never drift apart and nothing binary is hand-edited.
// Usage: pnpm --filter @katf/tech assets
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#10303A';
const NIGHT = '#0F1B21';
const MARK = `<g fill="none" stroke="#E08A4F" stroke-width="5" stroke-linecap="round"><path d="M12 44c6-12 14-18 20-18s14 6 20 18"/><path d="M22 30c2-8 6-14 10-14s8 6 10 14"/></g><circle cx="32" cy="48" r="4" fill="#fff"/>`;
const icon = (bg, rounded, scale = 1) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" ${rounded ? 'rx="16"' : ''} fill="${bg}"/>` +
      `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${MARK}</g></svg>`,
  );
const png = (svg, size) => sharp(svg, { density: 512 }).resize(size, size).flatten({ background: NIGHT }).png().toBuffer();

// ---------------------------------------------------------------- PWA icons
const out = join(root, 'public', 'icons');
await mkdir(out, { recursive: true });
await writeFile(join(out, 'icon-192.png'), await sharp(icon(INK, true), { density: 512 }).resize(192, 192).png().toBuffer());
await writeFile(join(out, 'icon-512.png'), await sharp(icon(INK, true), { density: 512 }).resize(512, 512).png().toBuffer());
await writeFile(join(out, 'maskable-512.png'), await png(icon(INK, false, 0.78), 512)); // mark inside the safe zone
await writeFile(join(out, 'apple-touch-icon.png'), await png(icon(INK, false, 0.82), 180)); // iOS rounds the corners itself
console.log('PWA icons written');

// ---------------------------------------------------------------- iPhone app
const app = join(root, '..', '..', 'ios', 'Katf'); // the Xcode project lives at the repository root
if (existsSync(app)) {
  // App Store icon: 1024 px, opaque, no transparency, no rounded corners
  await writeFile(join(app, 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png'), await png(icon(INK, false, 0.82), 1024));

  // Splash: the mark small and centred on the night background (scaleAspectFill crops the edges)
  const splash = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${NIGHT}"/>` +
      `<g transform="translate(1366 1366) scale(7) translate(-32 -32)"><rect width="64" height="64" rx="16" fill="${INK}"/>${MARK}</g></svg>`,
  );
  const s = await sharp(splash, { density: 72 }).resize(2732, 2732).png().toBuffer();
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) await writeFile(join(app, 'Assets.xcassets', 'Splash.imageset', f), s);

  // New-request alert sound for APNs ("sound": "new_request.caf"): three rising two-tone chimes, under 3 s.
  // CAF container, 16-bit big-endian linear PCM, mono, 44.1 kHz.
  const rate = 44100;
  const tones = [];
  for (let rep = 0; rep < 3; rep++) {
    tones.push({ f: 880, d: 0.16, gap: 0.04 }, { f: 1175, d: 0.22, gap: 0.04 });
    if (rep < 2) tones.push({ f: 0, d: 0.28, gap: 0 }); // pause between chimes
  }
  const samples = [];
  for (const t of tones) {
    const n = Math.round(t.d * rate);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (0.01 * rate), (n - i) / (0.04 * rate));
      samples.push(t.f ? Math.round(Math.sin((2 * Math.PI * t.f * i) / rate) * env * 0.6 * 32767) : 0);
    }
    for (let i = 0; i < Math.round(t.gap * rate); i++) samples.push(0);
  }
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => pcm.writeInt16BE(v, i * 2));
  const header = Buffer.alloc(8);
  header.write('caff', 0, 'ascii');
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(0, 6);
  const chunk = (type, body) => {
    const h = Buffer.alloc(12);
    h.write(type, 0, 'ascii');
    h.writeBigInt64BE(BigInt(body.length), 4);
    return Buffer.concat([h, body]);
  };
  const desc = Buffer.alloc(32);
  desc.writeDoubleBE(rate, 0);
  desc.write('lpcm', 8, 'ascii');
  desc.writeUInt32BE(0, 12); // flags: integer, big-endian
  desc.writeUInt32BE(2, 16); // bytes per packet
  desc.writeUInt32BE(1, 20); // frames per packet
  desc.writeUInt32BE(1, 24); // channels
  desc.writeUInt32BE(16, 28); // bits per channel
  const data = Buffer.concat([Buffer.alloc(4), pcm]); // edit count 0
  await writeFile(join(app, 'new_request.caf'), Buffer.concat([header, chunk('desc', desc), chunk('data', data)]));
  console.log(`iPhone icon, splash and sound written (${(samples.length / rate).toFixed(2)} s)`);
}
