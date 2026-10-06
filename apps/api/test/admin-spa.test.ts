import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADMIN_PATH, makeWorld, type World } from './helpers';

let w: World;
beforeAll(async () => {
  // a stand-in for admin/dist, so the test does not depend on a build
  const dist = mkdtempSync(join(tmpdir(), 'katf-admin-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><base href="%ADMIN_BASE%" /><script type="module" src="./assets/app.js"></script>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  process.env.ADMIN_DIST = dist;
  w = await makeWorld();
}, 60_000);
afterAll(async () => {
  delete process.env.ADMIN_DIST;
  await w.app.close();
  await w.ctx.handle.close();
});

describe('admin panel hosting (§9.1)', () => {
  it('serves the panel only under the secret path, with the path injected as <base>', async () => {
    const r = await w.app.inject({ method: 'GET', url: `/${ADMIN_PATH}/` });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(`<base href="/${ADMIN_PATH}/" />`);
    expect(r.headers['content-security-policy']).toContain("base-uri 'self'");
    expect(r.headers['x-robots-tag']).toContain('noindex');
    const deep = await w.app.inject({ method: 'GET', url: `/${ADMIN_PATH}/bookings/abc` });
    expect(deep.statusCode).toBe(200);
    const asset = await w.app.inject({ method: 'GET', url: `/${ADMIN_PATH}/assets/app.js` });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('no-store');
    expect((await w.app.inject({ method: 'GET', url: '/admin/' })).statusCode).toBe(404);
    expect((await w.app.inject({ method: 'GET', url: '/assets/app.js' })).statusCode).toBe(404);
  });
});
