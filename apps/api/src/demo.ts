/**
 * DEMO_MODE only (§0): clearly labelled demo data so the owner can click through every screen.
 * Never runs unless DEMO_MODE=true; every demo name starts with "تجريبي".
 */
import { eq } from 'drizzle-orm';
import type { Ctx } from './ctx';
import { technicians, technicianBank, users } from './db/schema';
import { newId } from './lib/ids';

export async function seedDemo(ctx: Ctx) {
  if (!ctx.config.DEMO_MODE) throw new Error('DEMO_MODE is off');
  const phone = '+96890000001';
  const idx = ctx.crypto.blindIndex('phone', phone);
  const exists = await ctx.db.select({ id: users.id }).from(users).where(eq(users.phoneIndex, idx));
  if (exists.length) return;
  const id = newId();
  await ctx.db.insert(users).values({ id, role: 'technician', phoneEnc: ctx.crypto.encrypt(phone), phoneIndex: idx, displayName: 'فني تجريبي', locale: 'ar' });
  await ctx.db.insert(technicians).values({
    userId: id,
    status: 'active',
    fullNameArEnc: ctx.crypto.encrypt('فني تجريبي للعرض'),
    fullNameEn: 'Demo Technician',
    publicName: 'فني تجريبي',
    civilIdEnc: ctx.crypto.encrypt('00000001'),
    civilIdIndex: ctx.crypto.blindIndex('civil_id', '00000001'),
    workStatus: 'omani_self_employed',
    bio: 'حساب تجريبي للعرض فقط — ليس فنياً حقيقياً.',
    experienceBand: '5-10',
    services: ['cleaning', 'gas', 'leak', 'diagnosis'],
    acTypes: ['split', 'window'],
    areas: [{ wilayat: 'seeb', neighbourhoods: [] }, { wilayat: 'bawshar', neighbourhoods: [] }],
    bookingSlug: 'demo',
    approvedAt: new Date(),
    quizPassedAt: new Date(),
  });
  const iban = 'OM040180000001299123456';
  await ctx.db.insert(technicianBank).values({ technicianId: id, bankName: 'بنك مسقط', ibanEnc: ctx.crypto.encrypt(iban), ibanIndex: ctx.crypto.blindIndex('iban', iban), holderEnc: ctx.crypto.encrypt('فني تجريبي للعرض'), verifiedAt: new Date() });
}
