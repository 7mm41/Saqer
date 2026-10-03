import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../src/config';
import { createContext } from '../src/context';
import { rotateDataKey } from '../src/services/rotate';
import { blockedIdentities, files, technicianBank, technicians, users } from '../src/db/schema';
import { newId } from '../src/lib/ids';

describe('DATA_KEY rotation (§13)', () => {
  it('re-encrypts fields and files, recomputes blind indexes, keeps bans; the old key no longer opens the data', async () => {
    const dir = `/tmp/katf-rotate-${randomBytes(4).toString('hex')}`;
    const A = randomBytes(32).toString('hex');
    const B = randomBytes(32).toString('hex');
    const base = { NODE_ENV: 'test', DATA_DIR: dir, ADMIN_PATH: 'r'.repeat(24) } as NodeJS.ProcessEnv;
    const phone = '+96891234567';
    const civil = '12345678';
    const iban = 'OM040180000001299123456';
    const bannedPhone = '+96899999999';

    // data written under key A
    const a = await createContext({ config: loadConfig({ ...base, DATA_KEY: A }) });
    const uid = newId();
    await a.db.insert(users).values({ id: uid, role: 'technician', phoneEnc: a.crypto.encrypt(phone), phoneIndex: a.crypto.blindIndex('phone', phone) });
    await a.db.insert(technicians).values({ userId: uid, status: 'active', civilIdEnc: a.crypto.encrypt(civil), civilIdIndex: a.crypto.blindIndex('civil_id', civil), fullNameArEnc: a.crypto.encrypt('سالم البلوشي') });
    await a.db.insert(technicianBank).values({ technicianId: uid, bankName: 'بنك مسقط', ibanEnc: a.crypto.encrypt(iban), ibanIndex: a.crypto.blindIndex('iban', iban), holderEnc: a.crypto.encrypt('سالم البلوشي') });
    // a ban with the stored value, and an older one with only an index (carried over through a known user)
    await a.db.insert(blockedIdentities).values({ id: newId(), kind: 'phone', indexValue: a.crypto.blindIndex('phone', bannedPhone), valueEnc: a.crypto.encrypt(bannedPhone), reason: 'test' });
    await a.db.insert(blockedIdentities).values({ id: newId(), kind: 'civil_id', indexValue: a.crypto.blindIndex('civil_id', civil), reason: 'legacy row' });
    const fileId = newId();
    await a.storage.put(`k-${fileId}`, Buffer.from('a private document'));
    await a.db.insert(files).values({ id: fileId, purpose: 'document', kind: 'image', mime: 'image/jpeg', size: 18, sha256: 'x', storageKey: `k-${fileId}` });
    await a.handle.close();

    // rotate: new key B, previous key A
    const rot = await createContext({ config: loadConfig({ ...base, DATA_KEY: B, DATA_KEY_PREVIOUS: A }) });
    const report = await rotateDataKey(rot);
    expect(report).toMatchObject({ users: 1, technicians: 1, banks: 1, blockedRecomputed: 1, blockedMapped: 1, blockedUnresolved: 0, files: 1 });
    await rot.handle.close();

    // only key B from now on
    const b = await createContext({ config: loadConfig({ ...base, DATA_KEY: B }) });
    const u = (await b.db.select().from(users).where(eq(users.phoneIndex, b.crypto.blindIndex('phone', phone))))[0]!;
    expect(b.crypto.decrypt(u.phoneEnc)).toBe(phone);
    const t = (await b.db.select().from(technicians).where(eq(technicians.civilIdIndex, b.crypto.blindIndex('civil_id', civil))))[0]!;
    expect(b.crypto.decrypt(t.fullNameArEnc)).toBe('سالم البلوشي');
    const bank = (await b.db.select().from(technicianBank).where(eq(technicianBank.ibanIndex, b.crypto.blindIndex('iban', iban))))[0]!;
    expect(b.crypto.decrypt(bank.ibanEnc)).toBe(iban);
    const bans = await b.db.select().from(blockedIdentities);
    expect(bans.map((x) => x.indexValue).sort()).toEqual([b.crypto.blindIndex('phone', bannedPhone), b.crypto.blindIndex('civil_id', civil)].sort());
    expect((await b.storage.get(`k-${fileId}`)).toString()).toBe('a private document');
    await b.handle.close();

    await expect(createContext({ config: loadConfig({ ...base, DATA_KEY: A }) })).rejects.toThrow(/DATA_KEY/);
  }, 90_000);
});
