/**
 * DATA_KEY rotation (§13). Run with the API stopped, DATA_KEY = the new key and DATA_KEY_PREVIOUS = the old one
 * (deploy/rotate-data-key.sh does this). In one transaction it re-encrypts every encrypted field under the new key
 * and recomputes every blind index, then re-encrypts the stored files. Safe to run again if interrupted:
 * values already under the new key are simply re-encrypted again.
 *
 * After it finishes, remove DATA_KEY_PREVIOUS. Links signed with the old key (tracking links in old SMS,
 * signed file links) stop working, and open sign-in codes are cancelled.
 */
import { eq } from 'drizzle-orm';
import type { Ctx } from '../ctx';
import {
  addresses,
  adminAccounts,
  blockedIdentities,
  bookings,
  files,
  otpChallenges,
  settings,
  signInHistory,
  technicianBank,
  technicians,
  users,
  waitlistEntries,
} from '../db/schema';
import type { DbOrTx } from '../db';

export interface RotationReport {
  users: number;
  technicians: number;
  banks: number;
  bookings: number;
  other: number;
  blockedRecomputed: number;
  blockedMapped: number;
  blockedUnresolved: number;
  files: number;
}

export async function rotateDataKey(ctx: Ctx): Promise<RotationReport> {
  const c = ctx.crypto;
  if (!c.keys.previous) throw new Error('Set DATA_KEY to the new key and DATA_KEY_PREVIOUS to the old key first.');
  const r: RotationReport = { users: 0, technicians: 0, banks: 0, bookings: 0, other: 0, blockedRecomputed: 0, blockedMapped: 0, blockedUnresolved: 0, files: 0 };
  // old index → new index for every value we can read, to carry over records that only store an index
  const moved = new Map<string, string>();
  const index = (kind: string, plain: string | null | undefined, fallback: string | null) => {
    if (!plain) return fallback;
    const next = c.blindIndex(kind, plain);
    const old = c.previousBlindIndex(kind, plain);
    if (old) moved.set(`${kind}:${old}`, next);
    return next;
  };

  await ctx.db.transaction(async (tx: DbOrTx) => {
    for (const u of await tx.select().from(users)) {
      await tx
        .update(users)
        .set({
          phoneEnc: c.reencrypt(u.phoneEnc),
          phoneIndex: index('phone', c.decrypt(u.phoneEnc), u.phoneIndex),
          emailEnc: c.reencrypt(u.emailEnc),
          emailIndex: index('email', c.decrypt(u.emailEnc), u.emailIndex),
        })
        .where(eq(users.id, u.id));
      r.users++;
    }
    for (const t of await tx.select().from(technicians)) {
      await tx
        .update(technicians)
        .set({
          fullNameArEnc: c.reencrypt(t.fullNameArEnc),
          dobEnc: c.reencrypt(t.dobEnc),
          civilIdEnc: c.reencrypt(t.civilIdEnc),
          civilIdIndex: index('civil_id', c.decrypt(t.civilIdEnc), t.civilIdIndex),
          crNumberEnc: c.reencrypt(t.crNumberEnc),
          referencesEnc: c.reencrypt(t.referencesEnc),
          emergencyContactEnc: c.reencrypt(t.emergencyContactEnc),
        })
        .where(eq(technicians.userId, t.userId));
      r.technicians++;
    }
    for (const b of await tx.select().from(technicianBank)) {
      await tx
        .update(technicianBank)
        .set({ ibanEnc: c.reencrypt(b.ibanEnc)!, ibanIndex: index('iban', c.decrypt(b.ibanEnc), b.ibanIndex)!, holderEnc: c.reencrypt(b.holderEnc)! })
        .where(eq(technicianBank.technicianId, b.technicianId));
      r.banks++;
    }
    for (const a of await tx.select().from(adminAccounts)) {
      await tx.update(adminAccounts).set({ totpSecretEnc: c.reencrypt(a.totpSecretEnc) }).where(eq(adminAccounts.userId, a.userId));
      r.other++;
    }
    for (const w of await tx.select().from(waitlistEntries)) {
      await tx.update(waitlistEntries).set({ phoneEnc: c.reencrypt(w.phoneEnc)!, phoneIndex: index('phone', c.decrypt(w.phoneEnc), w.phoneIndex)! }).where(eq(waitlistEntries.id, w.id));
      r.other++;
    }
    for (const a of await tx.select().from(addresses)) {
      if (!a.notesEnc) continue;
      await tx.update(addresses).set({ notesEnc: c.reencrypt(a.notesEnc) }).where(eq(addresses.id, a.id));
      r.other++;
    }
    for (const f of await tx.select().from(files)) {
      if (!f.captureMetaEnc) continue;
      await tx.update(files).set({ captureMetaEnc: c.reencrypt(f.captureMetaEnc) }).where(eq(files.id, f.id));
      r.other++;
    }
    for (const b of await tx.select().from(bookings)) {
      if (!b.address.notesEnc) continue;
      await tx.update(bookings).set({ address: { ...b.address, notesEnc: c.reencrypt(b.address.notesEnc) } }).where(eq(bookings.id, b.id));
      r.bookings++;
    }
    // bans: recompute from the stored value; older rows without it are carried over through the map
    for (const x of await tx.select().from(blockedIdentities)) {
      if (x.valueEnc) {
        await tx.update(blockedIdentities).set({ valueEnc: c.reencrypt(x.valueEnc), indexValue: c.blindIndex(x.kind, c.decrypt(x.valueEnc)!) }).where(eq(blockedIdentities.id, x.id));
        r.blockedRecomputed++;
      } else if (moved.has(`${x.kind}:${x.indexValue}`)) {
        await tx.update(blockedIdentities).set({ indexValue: moved.get(`${x.kind}:${x.indexValue}`)! }).where(eq(blockedIdentities.id, x.id));
        r.blockedMapped++;
      } else r.blockedUnresolved++;
    }
    for (const h of await tx.select().from(signInHistory)) {
      const next = h.emailIndex ? moved.get(`email:${h.emailIndex}`) : undefined;
      if (next) await tx.update(signInHistory).set({ emailIndex: next }).where(eq(signInHistory.id, h.id));
    }
    // short-lived codes are simply cancelled
    await tx.delete(otpChallenges);
    const check = (await tx.select().from(settings).where(eq(settings.key, '_key_check')))[0];
    if (check) await tx.update(settings).set({ value: c.reencrypt(check.value as string) as never }).where(eq(settings.key, '_key_check'));
  });

  // stored files (outside the database): read under either key, write under the new one
  for (const f of await ctx.db.select({ key: files.storageKey }).from(files)) {
    try {
      await ctx.storage.put(f.key, await ctx.storage.get(f.key));
      r.files++;
    } catch {
      /* a file deleted by retention is fine */
    }
  }
  return r;
}
