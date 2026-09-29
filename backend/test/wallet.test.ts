import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import forge from 'node-forge';
import { walletSignerFromPem } from '../src/lib/wallet.ts';
import { ADMIN, createTestApp, type Json } from './support.ts';

/** A test "Apple WWDR" authority and a Pass Type ID certificate it issued. */
function testIdentity() {
  const makeKeys = () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return {
      privateKey: forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()),
      publicKey: forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }).toString()),
    };
  };
  const certificate = (subject: string, keys: ReturnType<typeof makeKeys>, issuer: { name: string; key: forge.pki.PrivateKey }, serial: string, authority = false) => {
    const cert = forge.pki.createCertificate();
    if (authority) cert.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true }]);
    cert.publicKey = keys.publicKey;
    cert.serialNumber = serial;
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: subject }]);
    cert.setIssuer([{ name: 'commonName', value: issuer.name }]);
    cert.sign(issuer.key as forge.pki.rsa.PrivateKey, forge.md.sha256.create());
    return cert;
  };
  const caKeys = makeKeys();
  const ca = certificate('Test WWDR', caKeys, { name: 'Test WWDR', key: caKeys.privateKey }, '01', true);
  const passKeys = makeKeys();
  const pass = certificate('Pass Type ID: pass.om.sarena.test', passKeys, { name: 'Test WWDR', key: caKeys.privateKey }, '02');
  return {
    certificatePem: forge.pki.certificateToPem(pass),
    keyPem: forge.pki.privateKeyToPem(passKeys.privateKey),
    wwdrPem: forge.pki.certificateToPem(ca),
  };
}

/** Reads the zips our writer makes (local headers, deflate). */
function unzip(data: Buffer) {
  const files: Record<string, Buffer> = {};
  let offset = 0;
  while (data.readUInt32LE(offset) === 0x04034b50) {
    const size = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extra = data.readUInt16LE(offset + 28);
    const name = data.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extra;
    files[name] = inflateRawSync(data.subarray(start, start + size));
    offset = start + size;
  }
  return files;
}

let t: Awaited<ReturnType<typeof createTestApp>>;
let identity: ReturnType<typeof testIdentity>;
let folder: string;

before(async () => {
  identity = testIdentity();
  folder = mkdtempSync(join(tmpdir(), 'sarena-wallet-'));
  t = await createTestApp({
    wallet: walletSignerFromPem({ passTypeId: 'pass.om.sarena.test', teamId: 'TEAM123456', organization: 'Sarena', ...identity }),
  });
});

after(async () => {
  await t.close();
  rmSync(folder, { recursive: true, force: true });
});

async function download(url: string, token: string) {
  const response = await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  return { status: response.statusCode, type: response.headers['content-type'], body: response.rawPayload };
}

describe('Apple Wallet', () => {
  test('the app is told passes are available', async () => {
    assert.equal((await t.call('GET', '/v1/app/config')).body.wallet.enabled, true);
  });

  test('the membership card is a signed pass whose QR proves the membership', async () => {
    const token = await t.signIn('demo@sarena.om', 'Sarena2026');
    const pass = await download('/v1/me/wallet/membership.pkpass?lang=ar', token);
    assert.equal(pass.status, 200);
    assert.equal(pass.type, 'application/vnd.apple.pkpass');

    const files = unzip(pass.body);
    for (const name of ['pass.json', 'manifest.json', 'signature', 'icon.png', 'icon@2x.png', 'logo.png', 'en.lproj/pass.strings', 'ar.lproj/pass.strings']) {
      assert.ok(files[name], `${name} is in the pass`);
    }
    // Every file is listed in the manifest with its SHA-1.
    const manifest = JSON.parse(files['manifest.json']!.toString()) as Record<string, string>;
    for (const [name, data] of Object.entries(files)) {
      if (name === 'manifest.json' || name === 'signature') continue;
      assert.equal(manifest[name], createHash('sha1').update(data).digest('hex'), name);
    }
    // The signature is a detached PKCS #7 signature of the manifest by the pass certificate.
    writeFileSync(join(folder, 'manifest.json'), files['manifest.json']!);
    writeFileSync(join(folder, 'signature'), files.signature!);
    writeFileSync(join(folder, 'wwdr.pem'), identity.wwdrPem);
    execFileSync('openssl', ['smime', '-verify', '-binary', '-inform', 'DER', '-in', join(folder, 'signature'),
      '-content', join(folder, 'manifest.json'), '-CAfile', join(folder, 'wwdr.pem'), '-purpose', 'any', '-out', '/dev/null'], { stdio: 'pipe' });

    const json = JSON.parse(files['pass.json']!.toString()) as Json;
    assert.equal(json.passTypeIdentifier, 'pass.om.sarena.test');
    assert.equal(json.teamIdentifier, 'TEAM123456');
    assert.equal(json.generic.primaryFields[0].value, 'Sarena Demo');
    assert.equal(json.generic.secondaryFields[1].value, 'ACTIVE');
    assert.match(files['ar.lproj/pass.strings']!.toString(), /"ACTIVE" = "فعّالة";/);
    const qr = json.barcodes[0].message as string;
    assert.match(qr, /^sarena:\/\/member\?n=SRN-\d+&s=[\w-]{22}$/);

    // At the venue: staff scan it and see an active member.
    const staffToken = await t.signIn(ADMIN.email, ADMIN.password);
    const verified = await t.call('POST', '/v1/admin/members/verify', { token: staffToken, body: { qr } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.active, true);
    assert.equal(verified.body.member.fullName, 'Sarena Demo');
    assert.ok(verified.body.membership.expiresAt);

    // A card with a guessed or edited signature is refused; other codes are not cards.
    const forged = qr.replace(/s=[\w-]+$/, 's=AAAAAAAAAAAAAAAAAAAAAA');
    assert.equal((await t.call('POST', '/v1/admin/members/verify', { token: staffToken, body: { qr: forged } })).status, 404);
    assert.equal((await t.call('POST', '/v1/admin/members/verify', { token: staffToken, body: { qr: 'sarena://redeem?code=SRN-AB12-CD34' } })).status, 400);
    // Members cannot use the staff check.
    assert.equal((await t.call('POST', '/v1/admin/members/verify', { token, body: { qr } })).status, 403);
  });

  test('a member without a membership gets a card that says so', async () => {
    const member = await t.register('Salma Al Harthy');
    const files = unzip((await download('/v1/me/wallet/membership.pkpass?lang=en', member.token)).body);
    const json = JSON.parse(files['pass.json']!.toString()) as Json;
    assert.equal(json.generic.secondaryFields[1].value, 'INACTIVE');
    assert.equal(json.expirationDate, undefined);
    const staffToken = await t.signIn(ADMIN.email, ADMIN.password);
    const verified = await t.call('POST', '/v1/admin/members/verify', { token: staffToken, body: { qr: json.barcodes[0].message } });
    assert.equal(verified.body.active, false);
    assert.equal(verified.body.membership, null);
  });

  test('each booking code becomes a pass with the same QR as the app, voided once used', async () => {
    const token = await t.signIn('demo@sarena.om', 'Sarena2026');
    const venues = (await t.call('GET', '/v1/venues', { token })).body.venues as Json[];
    const venue = venues.find((v) => v.offers.length > 0)!;
    const booked = await t.call('POST', '/v1/bookings', { token, body: { offerId: venue.offers[0].id, quantity: 2 } });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    const { booking } = booked.body;

    const url = `/v1/me/bookings/${booking.id}/wallet.pkpass?lang=en`;
    let json = JSON.parse(unzip((await download(url, token)).body)['pass.json']!.toString()) as Json;
    const fields = json.eventTicket ?? json.coupon;
    assert.equal(fields.primaryFields[0].value, venue.name.en);
    assert.equal(json.barcodes[0].message, `sarena://redeem?code=${booking.code}`);
    assert.equal(json.voided, false);
    assert.deepEqual(json.locations, [{ latitude: venue.latitude, longitude: venue.longitude }]);

    const staffToken = await t.signIn(ADMIN.email, ADMIN.password);
    await t.call('POST', '/v1/admin/bookings/redeem', { token: staffToken, body: { code: booking.code } });
    json = JSON.parse(unzip((await download(url, token)).body)['pass.json']!.toString()) as Json;
    assert.equal(json.voided, true);

    // Another member's code is not theirs to download.
    const other = await t.register();
    assert.equal((await download(url, other.token)).status, 404);
  });
});

describe('Apple Wallet without a certificate', () => {
  test('is switched off, and says why', async () => {
    const plain = await createTestApp();
    try {
      assert.equal((await plain.call('GET', '/v1/app/config')).body.wallet.enabled, false);
      const token = await plain.signIn('demo@sarena.om', 'Sarena2026');
      const refused = await plain.call('GET', '/v1/me/wallet/membership.pkpass', { token });
      assert.equal(refused.status, 503);
      assert.equal(refused.body.error.code, 'wallet_unavailable');
    } finally {
      await plain.close();
    }
  });
});
