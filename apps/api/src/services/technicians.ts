/**
 * Technician registration (§6), profile, earnings and account (§7).
 */
import { and, desc, eq, inArray, isNull, gt, sql, ne } from 'drizzle-orm';
import {
  ageOn,
  normaliseCivilId,
  normaliseOmanIban,
  normaliseOmanPhone,
  maskIban,
  TECH_SERVICES,
  AC_TYPES,
  EXPERIENCE_BANDS,
  WORK_STATUSES,
  TOOLS,
  ACTIVE_STATUSES,
  share,
} from '@katf/shared';
import type { Ctx, Actor } from '../ctx';
import type { DbOrTx } from '../db';
import {
  adjustments,
  blockedIdentities,
  bookings,
  payableItems,
  payouts,
  profileEditRequests,
  quizAttempts,
  strikes,
  technicianBank,
  technicianDocuments,
  technicians,
  users,
  areas,
  reviews,
} from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { newId, slugify } from '../lib/ids';
import { audit } from './audit';
import { assertAcceptsCurrent, pendingAcceptances, recordConsents, REQUIRED } from './legal';
import { notify, notifyAdmins } from './notifications';
import { logoutEverywhere } from './auth';

export type Tech = typeof technicians.$inferSelect;

export async function ensureTechnician(ctx: Ctx, userId: string) {
  const r = await ctx.db.select().from(technicians).where(eq(technicians.userId, userId));
  if (r[0]) return r[0];
  await ctx.db.insert(technicians).values({ userId, status: 'draft' }).onConflictDoNothing();
  return (await ctx.db.select().from(technicians).where(eq(technicians.userId, userId)))[0]!;
}

async function isBlocked(tx: DbOrTx, kind: string, idx: string) {
  return (await tx.select({ id: blockedIdentities.id }).from(blockedIdentities).where(and(eq(blockedIdentities.kind, kind), eq(blockedIdentities.indexValue, idx)))).length > 0;
}

export function publicNameFrom(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

const editable = (t: Tech) => ['draft', 'needs_info'].includes(t.status);

function addDays(now: number, days: number) {
  return new Date(now + days * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- quiz (draft content, D47)

export const QUIZ: { id: string; topic: string; q: { ar: string; en: string }; options: { ar: string; en: string }[]; correct: number }[] = [
  { id: 'q1', topic: 'job', q: { ar: 'متى يبدأ العمل الفعلي على المكيّف؟', en: 'When does the actual work start?' }, options: [{ ar: 'فور الوصول', en: 'On arrival' }, { ar: 'بعد موافقة الزبون على العرض ودفعه داخل التطبيق', en: 'After the customer approves and pays in the app' }, { ar: 'بعد اتصال الزبون هاتفياً', en: 'After the customer calls' }], correct: 1 },
  { id: 'q2', topic: 'job', q: { ar: 'ماذا يحدث إذا لم تقبل الطلب خلال المهلة؟', en: "What happens if you don't accept in time?" }, options: [{ ar: 'يبقى لك دائماً', en: 'It stays yours' }, { ar: 'ينتقل الطلب لغيرك', en: 'It moves on' }, { ar: 'يُلغى ويُغرَّم الزبون', en: 'It is cancelled and the customer is charged' }], correct: 1 },
  { id: 'q3', topic: 'arrival', q: { ar: 'كيف تسجّل وصولك؟', en: 'How do you record arrival?' }, options: [{ ar: 'من التطبيق عند موقع الزبون مع صورة', en: 'In the app at the customer’s location with a photo' }, { ar: 'برسالة واتساب', en: 'By WhatsApp' }, { ar: 'لا حاجة لذلك', en: 'No need' }], correct: 0 },
  { id: 'q4', topic: 'arrival', q: { ar: 'ما الذي يجوز تصويره داخل البيت؟', en: 'What may you photograph inside a home?' }, options: [{ ar: 'كل شيء', en: 'Everything' }, { ar: 'الجهاز ومكانه فقط', en: 'Only the unit and its location' }, { ar: 'أهل البيت', en: 'The family' }], correct: 1 },
  { id: 'q5', topic: 'quote', q: { ar: 'وجدت عطلاً إضافياً أثناء العمل. ماذا تفعل؟', en: 'You find an extra fault while working. What do you do?' }, options: [{ ar: 'أصلحه وأضيف المبلغ لاحقاً', en: 'Fix it and add the cost later' }, { ar: 'أرسل نسخة جديدة من العرض وأنتظر الموافقة', en: 'Send a new quote version and wait for approval' }, { ar: 'أطلب نقداً', en: 'Ask for cash' }], correct: 1 },
  { id: 'q6', topic: 'quote', q: { ar: 'هل رسم الزيارة جزء من إجمالي العرض؟', en: 'Is the visit fee part of the quote total?' }, options: [{ ar: 'نعم، يُخصم من الإجمالي', en: 'Yes, it is deducted from the total' }, { ar: 'لا، يُضاف فوقه', en: 'No, it is added on top' }], correct: 0 },
  { id: 'q7', topic: 'money', q: { ar: 'متى يُصرف مستحقك؟', en: 'When are you paid?' }, options: [{ ar: 'نقداً من الزبون', en: 'Cash from the customer' }, { ar: 'بعد تأكيد الزبون ومرور مدة الصرف المحددة', en: 'After the customer confirms and the payout delay passes' }, { ar: 'آخر الشهر', en: 'End of month' }], correct: 1 },
  { id: 'q8', topic: 'money', q: { ar: 'زبون جلبته بنفسك عبر رابطك. ما العمولة؟', en: 'A customer you brought with your link. Which commission?' }, options: [{ ar: 'العمولة الأقل للزبائن الخاصين', en: 'The lower own-customer commission' }, { ar: 'العمولة الكاملة', en: 'The full commission' }, { ar: 'لا شيء ولا دفع عبر المنصة', en: 'None and no payment through the platform' }], correct: 0 },
  { id: 'q9', topic: 'conduct', q: { ar: 'طلب الزبون أن يدفع لك نقداً خارج التطبيق. ماذا تفعل؟', en: 'The customer offers cash outside the app. What do you do?' }, options: [{ ar: 'أقبل', en: 'Accept' }, { ar: 'أرفض بلطف وأوضح أن الدفع عبر المنصة يحميه', en: 'Politely decline; paying through the platform protects them' }], correct: 1 },
  { id: 'q10', topic: 'conduct', q: { ar: 'شعرت أن الموقع غير آمن. ماذا تفعل؟', en: 'The site feels unsafe. What do you do?' }, options: [{ ar: 'أكمل العمل بسرعة', en: 'Finish quickly' }, { ar: 'أتوقف وأستخدم «بلاغ سلامة» وأتصل بـ 9999 عند الخطر', en: 'Stop, use the safety report, call 9999 if in danger' }], correct: 1 },
];

// ---------------------------------------------------------------- wizard

export async function saveStep(ctx: Ctx, userId: string, step: number, data: Record<string, unknown>) {
  const t = await ensureTechnician(ctx, userId);
  if (!editable(t)) throw conflict('application_locked');
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const patch: Partial<typeof technicians.$inferInsert> = {};
  const draft = { ...t.draft, [`step${step}`]: data };
  const str = (k: string, max = 200) => {
    const v = data[k];
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
  };
  const arr = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).map(String) : []);

  switch (step) {
    case 2: {
      const fullNameAr = str('fullNameAr', 120);
      if (fullNameAr.split(/\s+/).length < 2) throw badRequest('full_name_required');
      const dob = str('dob', 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw badRequest('invalid_date');
      if (ageOn(dob, new Date(now)) < 18) throw badRequest('too_young');
      const civil = normaliseCivilId(str('civilId', 20));
      if (!civil) throw badRequest('invalid_civil_id');
      const idx = ctx.crypto.blindIndex('civil_id', civil);
      if (await isBlocked(ctx.db, 'civil_id', idx)) throw forbidden('blocked');
      const dup = await ctx.db.select({ id: technicians.userId }).from(technicians).where(and(eq(technicians.civilIdIndex, idx), ne(technicians.userId, userId)));
      if (dup.length) throw conflict('already_registered');
      const photo = str('photoFileId', 60);
      if (!photo) throw badRequest('photo_required');
      Object.assign(patch, {
        fullNameArEnc: ctx.crypto.encrypt(fullNameAr),
        fullNameEn: str('fullNameEn', 120) || null,
        publicName: publicNameFrom(fullNameAr),
        dobEnc: ctx.crypto.encrypt(dob),
        nationality: str('nationality', 60),
        civilIdEnc: ctx.crypto.encrypt(civil),
        civilIdIndex: idx,
        photoFileId: photo,
      });
      const email = str('email', 120).toLowerCase();
      const locale = str('locale', 2) === 'en' ? 'en' : 'ar';
      await ctx.db.update(users).set({ locale, displayName: publicNameFrom(fullNameAr), ...(email ? { emailEnc: ctx.crypto.encrypt(email) } : {}) }).where(eq(users.id, userId));
      draft.step2 = { ...data, civilId: undefined, dob: undefined, fullNameAr: undefined }; // sensitive values live only in encrypted columns
      break;
    }
    case 3: {
      const ws = str('workStatus', 40);
      if (!WORK_STATUSES.some((w) => w.id === ws)) throw badRequest('invalid_work_status');
      if (data.declaration !== true) throw badRequest('declaration_required');
      Object.assign(patch, { workStatus: ws, crNumberEnc: ws === 'company' ? ctx.crypto.encrypt(str('crNumber', 30) || null) : null });
      draft.step3 = { workStatus: ws, declaration: true };
      break;
    }
    case 4: {
      // documents are uploaded separately; this step checks what is required is present
      const docs = await ctx.db.select().from(technicianDocuments).where(and(eq(technicianDocuments.technicianId, userId), ne(technicianDocuments.status, 'rejected')));
      const needed = ['civil_id_front', 'civil_id_back', 'selfie_with_id', ...requiredForStatus(s, t.workStatus)];
      const missing = needed.filter((n) => !docs.some((d) => d.type === n));
      if (missing.length) throw badRequest('documents_missing', { missing });
      break;
    }
    case 5: {
      const services = arr('services').filter((x) => TECH_SERVICES.some((o) => o.id === x));
      if (!services.length) throw badRequest('services_required');
      const work = arr('workPhotoIds');
      if (work.length < Number(s.work_photos_min) || work.length > Number(s.work_photos_max)) throw badRequest('work_photos_count', { min: Number(s.work_photos_min), max: Number(s.work_photos_max) });
      const bio = str('bio', 2000);
      if (bio.length > Number(s.bio_max_chars)) throw badRequest('too_long');
      const band = str('experienceBand', 10);
      if (!EXPERIENCE_BANDS.some((b) => b.id === band)) throw badRequest('experience_required');
      Object.assign(patch, {
        services,
        acTypes: arr('acTypes').filter((x) => AC_TYPES.some((o) => o.id === x)),
        brands: arr('brands').slice(0, 30),
        experienceBand: band,
        workPhotoIds: work,
        bio,
        ownVehicle: data.ownVehicle === true,
        tools: arr('tools').filter((x) => TOOLS.some((o) => o.id === x)),
        teamSize: str('teamSize', 20) === 'assistant' ? 'assistant' : 'solo',
      });
      break;
    }
    case 6: {
      const areasIn = Array.isArray(data.areas) ? (data.areas as { wilayat: string; neighbourhoods: string[] }[]) : [];
      const active = await ctx.db.select().from(areas).where(eq(areas.active, true));
      const clean = areasIn
        .filter((a) => active.some((x) => x.wilayat === a.wilayat))
        .map((a) => ({ wilayat: a.wilayat, neighbourhoods: (a.neighbourhoods ?? []).filter((n) => active.find((x) => x.wilayat === a.wilayat)!.neighbourhoods.some((nn) => nn.id === n)) }));
      if (!clean.length) throw badRequest('areas_required');
      const days = (Array.isArray(data.workingDays) ? (data.workingDays as number[]) : []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (!days.length) throw badRequest('days_required');
      const from = str('from', 5) || '08:00';
      const to = str('to', 5) || '20:00';
      if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || from >= to) throw badRequest('invalid_hours');
      const max = Number(data.maxJobsPerDay ?? 4);
      if (!Number.isInteger(max) || max < 1 || max > 12) throw badRequest('invalid_max_jobs');
      Object.assign(patch, {
        areas: clean,
        workingDays: days,
        workingHours: { from, to },
        maxJobsPerDay: max,
        maxDistanceKm: Number.isInteger(data.maxDistanceKm) ? Number(data.maxDistanceKm) : null,
        vacationUntil: typeof data.vacationUntil === 'string' && data.vacationUntil ? new Date(`${data.vacationUntil}T23:59:59+04:00`) : null,
      });
      break;
    }
    case 7: {
      await setBank(ctx, userId, { bankName: str('bankName', 60), iban: str('iban', 40), holderName: str('holderName', 120), letterFileId: str('letterFileId', 60) || null }, { initial: true });
      draft.step7 = { bankName: str('bankName', 60) };
      break;
    }
    case 8: {
      const refs = (Array.isArray(data.references) ? (data.references as Record<string, string>[]) : []).slice(0, 2).filter((r) => r.name);
      for (const r of refs) if (r.phone && !normaliseOmanPhone(r.phone)) throw badRequest('invalid_phone');
      const em = (data.emergency ?? {}) as Record<string, string>;
      if (!em.name || !normaliseOmanPhone(em.phone ?? '')) throw badRequest('emergency_required');
      Object.assign(patch, { referencesEnc: ctx.crypto.encryptJson(refs), emergencyContactEnc: ctx.crypto.encryptJson({ name: em.name, phone: normaliseOmanPhone(em.phone!) }) });
      draft.step8 = { references: refs.length, emergency: true };
      break;
    }
    default:
      throw badRequest('invalid_step');
  }
  await ctx.db.update(technicians).set({ ...patch, draft, wizardStep: Math.max(t.wizardStep, step + 1), updatedAt: new Date(now) }).where(eq(technicians.userId, userId));
  return { ok: true, nextStep: step + 1 };
}

function requiredForStatus(s: Record<string, unknown>, ws: string | null) {
  const map = (s.work_status_documents ?? {}) as Record<string, string[]>;
  return ws ? map[ws] ?? [] : [];
}

export async function addDocument(ctx: Ctx, userId: string, i: { type: string; fileId: string; expiresAt?: string | null }) {
  const t = await ensureTechnician(ctx, userId);
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const expiring = ['civil_id_front', 'residence_card', 'labour_card', 'commercial_registration'];
  if (expiring.includes(i.type)) {
    if (!i.expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(i.expiresAt)) throw badRequest('expiry_required');
    if (i.expiresAt < addDays(now, Number(s.doc_min_days_before_expiry_at_signup))) throw badRequest('doc_expiring', { days: Number(s.doc_min_days_before_expiry_at_signup) });
  }
  if (!editable(t) && !['active', 'approved_probation', 'paused'].includes(t.status)) throw conflict('application_locked');
  // a new upload replaces the previous one of the same type (except work samples and certificates)
  if (!['certification', 'work_sample'].includes(i.type))
    await ctx.db
      .update(technicianDocuments)
      .set({ status: 'rejected', rejectReason: 'replaced' })
      .where(and(eq(technicianDocuments.technicianId, userId), eq(technicianDocuments.type, i.type), ne(technicianDocuments.status, 'rejected')));
  const id = newId();
  await ctx.db.insert(technicianDocuments).values({ id, technicianId: userId, type: i.type, fileId: i.fileId, expiresAt: i.expiresAt ?? null, status: 'pending' });
  if (['active', 'approved_probation', 'paused'].includes(t.status)) await notifyAdmins(ctx, ctx.db, ['owner', 'verifier'], `مستند جديد من فني للمراجعة`);
  return { id };
}

export async function submitQuiz(ctx: Ctx, userId: string, answers: Record<string, number>) {
  const s = await ctx.settings.all();
  let correct = 0;
  const wrong = new Set<string>();
  for (const q of QUIZ) {
    if (answers[q.id] === q.correct) correct++;
    else wrong.add(q.topic);
  }
  const score = Math.round((correct * 100) / QUIZ.length);
  const passed = score >= Number(s.quiz_pass_pct);
  await ctx.db.insert(quizAttempts).values({ id: newId(), technicianId: userId, score, passed, wrongTopics: [...wrong] });
  if (passed) await ctx.db.update(technicians).set({ quizPassedAt: new Date(ctx.clock.now()), wizardStep: sql`greatest(${technicians.wizardStep}, 10)` }).where(eq(technicians.userId, userId));
  return { passed, score, reviewTopics: passed ? [] : [...wrong] };
}

export async function submitApplication(
  ctx: Ctx,
  userId: string,
  i: { acceptedDocIds: string[]; truthDeclaration: boolean; marketing: boolean; signatureName: string; signatureFileId: string; locale: 'ar' | 'en' },
  meta: { ip?: string | null; ua?: string | null },
) {
  const t = await ensureTechnician(ctx, userId);
  if (!editable(t)) throw conflict('application_locked');
  if (!i.truthDeclaration) throw badRequest('declaration_required');
  if (!t.fullNameArEnc || !t.workStatus || !t.services.length || !t.areas.length || !t.quizPassedAt) throw badRequest('application_incomplete');
  const bank = (await ctx.db.select().from(technicianBank).where(eq(technicianBank.technicianId, userId)))[0];
  if (!bank) throw badRequest('application_incomplete');
  const fullName = ctx.crypto.decrypt(t.fullNameArEnc);
  if (i.signatureName.trim().replace(/\s+/g, ' ') !== fullName.trim().replace(/\s+/g, ' ')) throw badRequest('name_mismatch');
  if (!i.signatureFileId) throw badRequest('signature_required');
  await assertAcceptsCurrent(ctx.db, REQUIRED.technician, i.acceptedDocIds);
  const now = new Date(ctx.clock.now());
  await ctx.db.transaction(async (tx) => {
    await recordConsents(tx, {
      userId,
      docIds: i.acceptedDocIds,
      context: 'registration',
      ipHash: ctx.crypto.hashIp(meta.ip),
      userAgent: meta.ua ?? null,
      locale: i.locale,
      signatureName: i.signatureName.trim(),
      signatureFileId: i.signatureFileId,
    });
    await tx.update(users).set({ marketingConsent: i.marketing }).where(eq(users.id, userId));
    await tx
      .update(technicians)
      .set({ status: 'submitted', applicationSubmittedAt: now, needsInfo: null, needsInfoMessage: null, draft: { ...t.draft, step10: { truthDeclaration: true, at: now.toISOString() } } })
      .where(eq(technicians.userId, userId));
    await audit(tx, { id: userId, role: 'technician' }, { action: 'technician.submit', entity: 'technician', entityId: userId });
    await notify(ctx, tx, { userId, key: 'app_received' });
    await notifyAdmins(ctx, tx, ['owner', 'verifier'], 'طلب انضمام جديد بانتظار المراجعة');
  });
}

export async function applicationStatus(ctx: Ctx, userId: string) {
  const t = await ensureTechnician(ctx, userId);
  const docs = await ctx.db.select().from(technicianDocuments).where(and(eq(technicianDocuments.technicianId, userId), ne(technicianDocuments.status, 'rejected')));
  const bank = (await ctx.db.select({ id: technicianBank.technicianId }).from(technicianBank).where(eq(technicianBank.technicianId, userId)))[0];
  const s = await ctx.settings.all();
  const checklist = {
    personal: Boolean(t.fullNameArEnc && t.civilIdIndex && t.photoFileId),
    eligibility: Boolean(t.workStatus),
    identity: ['civil_id_front', 'civil_id_back', 'selfie_with_id', ...requiredForStatus(s, t.workStatus)].every((x) => docs.some((d) => d.type === x)),
    skills: t.services.length > 0,
    coverage: t.areas.length > 0,
    payout: Boolean(bank),
    contacts: Boolean(t.emergencyContactEnc),
    quiz: Boolean(t.quizPassedAt),
    agreements: !['draft', 'needs_info'].includes(t.status),
  };
  return {
    status: t.status,
    wizardStep: t.wizardStep,
    draft: t.draft,
    checklist,
    needsInfo: t.needsInfo,
    needsInfoMessage: t.needsInfoMessage,
    rejectReason: t.rejectReason,
    reviewSla: String(s.review_sla_text),
    documents: docs.map((d) => ({ id: d.id, type: d.type, status: d.status, expiresAt: d.expiresAt })),
    reapplyAfter: t.status === 'rejected' && t.reviewedAt ? new Date(t.reviewedAt.getTime() + Number(s.reapply_after_days) * 86_400_000) : null,
  };
}

// ---------------------------------------------------------------- bank (§6 step 7, §7.5)

export async function setBank(ctx: Ctx, userId: string, i: { bankName: string; iban: string; holderName: string; letterFileId?: string | null }, opts: { initial: boolean }) {
  const s = await ctx.settings.all();
  if (!(s.banks as string[]).includes(i.bankName)) throw badRequest('invalid_bank');
  const iban = normaliseOmanIban(i.iban);
  if (!iban) throw badRequest('invalid_iban');
  const idx = ctx.crypto.blindIndex('iban', iban);
  if (await isBlocked(ctx.db, 'iban', idx)) throw forbidden('blocked');
  const other = await ctx.db.select({ id: technicianBank.technicianId }).from(technicianBank).where(and(eq(technicianBank.ibanIndex, idx), ne(technicianBank.technicianId, userId)));
  if (other.length) throw conflict('already_registered');
  if (!i.holderName.trim()) throw badRequest('required');
  const t = await ensureTechnician(ctx, userId);
  const fullAr = t.fullNameArEnc ? ctx.crypto.decrypt(t.fullNameArEnc) : '';
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const mismatch = !(norm(i.holderName) === norm(fullAr) || (t.fullNameEn && norm(i.holderName) === norm(t.fullNameEn)));
  const now = ctx.clock.now();
  const existing = (await ctx.db.select().from(technicianBank).where(eq(technicianBank.technicianId, userId)))[0];
  const history = [...(existing?.history ?? [])];
  if (existing) history.push({ at: new Date(now).toISOString(), bankName: existing.bankName, ibanLast4: ctx.crypto.decrypt(existing.ibanEnc).slice(-4) });
  const values = {
    bankName: i.bankName,
    ibanEnc: ctx.crypto.encrypt(iban),
    ibanIndex: idx,
    holderEnc: ctx.crypto.encrypt(i.holderName.trim()),
    letterFileId: i.letterFileId ?? null,
    nameMismatch: mismatch,
    verifiedAt: null,
    lockedUntil: opts.initial ? null : new Date(now + Number(s.bank_change_lock_hours) * 3600_000),
    history,
    updatedAt: new Date(now),
  };
  if (existing) await ctx.db.update(technicianBank).set(values).where(eq(technicianBank.technicianId, userId));
  else await ctx.db.insert(technicianBank).values({ technicianId: userId, ...values });
  if (!opts.initial) {
    await audit(ctx.db, { id: userId, role: 'technician' }, { action: 'technician.bank_change', entity: 'technician', entityId: userId });
    await notify(ctx, ctx.db, { userId, key: 'admin_alert', vars: { what: 'تم تغيير حسابك البنكي. إن لم تكن أنت فتواصل معنا فوراً.' }, alsoSms: true });
    await notifyAdmins(ctx, ctx.db, ['owner', 'finance', 'verifier'], 'تغيير حساب بنكي لفني بحاجة لتحقق');
  }
  return { mismatch, ibanMasked: maskIban(iban) };
}

// ---------------------------------------------------------------- views

export async function techProfile(ctx: Ctx, userId: string) {
  const t = await ensureTechnician(ctx, userId);
  const bank = (await ctx.db.select().from(technicianBank).where(eq(technicianBank.technicianId, userId)))[0];
  const docs = await ctx.db.select().from(technicianDocuments).where(and(eq(technicianDocuments.technicianId, userId), ne(technicianDocuments.status, 'rejected')));
  const pendingEdits = await ctx.db.select().from(profileEditRequests).where(and(eq(profileEditRequests.technicianId, userId), eq(profileEditRequests.status, 'pending')));
  const activeStrikes = await ctx.db
    .select()
    .from(strikes)
    .where(and(eq(strikes.technicianId, userId), isNull(strikes.removedAt), gt(strikes.expiresAt, new Date(ctx.clock.now()))));
  return {
    status: t.status,
    publicName: t.publicName,
    photoFileId: t.photoFileId,
    bio: t.bio,
    experienceBand: t.experienceBand,
    services: t.services,
    acTypes: t.acTypes,
    brands: t.brands,
    areas: t.areas,
    workingDays: t.workingDays,
    workingHours: t.workingHours,
    maxJobsPerDay: t.maxJobsPerDay,
    vacationUntil: t.vacationUntil,
    available: t.available,
    bookingSlug: t.bookingSlug,
    rating: t.ratingCount ? Math.round((t.ratingSum * 10) / t.ratingCount) / 10 : null,
    ratingCount: t.ratingCount,
    jobsCompleted: t.jobsCompleted,
    probationJobsLeft: t.probationJobsLeft,
    workPhotoIds: t.workPhotoIds,
    bank: bank ? { bankName: bank.bankName, ibanMasked: maskIban(ctx.crypto.decrypt(bank.ibanEnc)), lockedUntil: bank.lockedUntil, nameMismatch: bank.nameMismatch } : null,
    documents: docs.map((d) => ({ id: d.id, type: d.type, status: d.status, expiresAt: d.expiresAt })),
    pendingEdits: pendingEdits.map((p) => p.changes),
    strikes: activeStrikes.map((x) => ({ id: x.id, reasonCode: x.reasonCode, expiresAt: x.expiresAt, appealStatus: x.appealStatus, createdAt: x.createdAt })),
    commissionOwnPct: null as number | null,
  };
}

/** Public card: exactly what customers see (§7). */
export async function publicTechnician(ctx: Ctx, slug: string) {
  const t = (await ctx.db.select().from(technicians).where(eq(technicians.bookingSlug, slug)))[0];
  if (!t || !['active', 'approved_probation', 'paused'].includes(t.status)) return null;
  const revs = await ctx.db
    .select({ rating: reviews.rating, comment: reviews.comment, tags: reviews.tags, reply: reviews.reply, createdAt: reviews.createdAt })
    .from(reviews)
    .where(and(eq(reviews.technicianId, t.userId), eq(reviews.visibility, 'public'), eq(reviews.moderationStatus, 'visible')))
    .orderBy(desc(reviews.createdAt))
    .limit(10);
  const now = ctx.clock.now();
  return {
    id: t.userId,
    slug: t.bookingSlug,
    name: t.publicName,
    photoFileId: t.photoFileId,
    verified: true,
    rating: t.ratingCount ? Math.round((t.ratingSum * 10) / t.ratingCount) / 10 : null,
    ratingCount: t.ratingCount,
    jobs: t.jobsCompleted,
    experienceBand: t.experienceBand,
    services: t.services,
    acTypes: t.acTypes,
    areas: t.areas,
    bio: t.bio,
    workPhotoIds: t.workPhotoIds.slice(0, 10),
    bookable: ['active', 'approved_probation'].includes(t.status) && t.available && !(t.vacationUntil && t.vacationUntil.getTime() > now),
    vacationUntil: t.vacationUntil && t.vacationUntil.getTime() > now ? t.vacationUntil : null,
    reviews: revs,
  };
}

export async function updateProfile(ctx: Ctx, userId: string, i: Record<string, unknown>) {
  const t = await ensureTechnician(ctx, userId);
  if (!['active', 'approved_probation', 'paused'].includes(t.status)) throw conflict('application_locked');
  const direct: Partial<typeof technicians.$inferInsert> = {};
  if (Array.isArray(i.services)) direct.services = (i.services as string[]).filter((x) => TECH_SERVICES.some((o) => o.id === x));
  if (Array.isArray(i.acTypes)) direct.acTypes = (i.acTypes as string[]).filter((x) => AC_TYPES.some((o) => o.id === x));
  if (Array.isArray(i.brands)) direct.brands = (i.brands as string[]).slice(0, 30);
  if (Array.isArray(i.areas)) direct.areas = i.areas as { wilayat: string; neighbourhoods: string[] }[];
  if (Array.isArray(i.workingDays)) direct.workingDays = (i.workingDays as number[]).filter((d) => d >= 0 && d <= 6);
  if (i.workingHours && typeof i.workingHours === 'object') direct.workingHours = i.workingHours as { from: string; to: string };
  if (typeof i.maxJobsPerDay === 'number') direct.maxJobsPerDay = Math.min(12, Math.max(1, Math.floor(i.maxJobsPerDay)));
  if ('vacationUntil' in i) direct.vacationUntil = typeof i.vacationUntil === 'string' && i.vacationUntil ? new Date(`${i.vacationUntil}T23:59:59+04:00`) : null;
  if (typeof i.available === 'boolean') direct.available = i.available;
  if (Object.keys(direct).length) await ctx.db.update(technicians).set({ ...direct, updatedAt: new Date(ctx.clock.now()) }).where(eq(technicians.userId, userId));
  // public-facing changes go back to admin approval; the old version stays live meanwhile
  const review: Record<string, unknown> = {};
  if (typeof i.bio === 'string' && i.bio !== t.bio) review.bio = i.bio.slice(0, 2000);
  if (typeof i.photoFileId === 'string' && i.photoFileId !== t.photoFileId) review.photoFileId = i.photoFileId;
  if (Array.isArray(i.workPhotoIds)) review.workPhotoIds = (i.workPhotoIds as string[]).slice(0, 10);
  if (Object.keys(review).length) {
    await ctx.db.insert(profileEditRequests).values({ id: newId(), technicianId: userId, changes: review });
    await notifyAdmins(ctx, ctx.db, ['owner', 'verifier'], 'تعديل ملف فني بانتظار الموافقة');
  }
  return { pendingReview: Object.keys(review) };
}

export async function earnings(ctx: Ctx, userId: string) {
  const items = await ctx.db.select().from(payableItems).where(eq(payableItems.technicianId, userId)).orderBy(desc(payableItems.createdAt));
  const now = ctx.clock.now();
  const awaitingConfirmation = await ctx.db
    .select()
    .from(bookings)
    .where(and(eq(bookings.technicianId, userId), inArray(bookings.status, ['completed_pending_confirmation', 'disputed', 'in_progress', 'repair_payment_pending'])));
  const jobs = await ctx.db
    .select()
    .from(bookings)
    .where(and(eq(bookings.technicianId, userId), inArray(bookings.status, ['settled', 'paid_out', 'closed_visit_only', 'customer_absent', 'cancelled_by_customer', 'refunded_partial', 'repair_failed_closed'])))
    .orderBy(desc(bookings.updatedAt))
    .limit(100);
  const pays = await ctx.db.select().from(payouts).where(eq(payouts.technicianId, userId)).orderBy(desc(payouts.createdAt));
  const adj = await ctx.db.select().from(adjustments).where(eq(adjustments.technicianId, userId)).orderBy(desc(adjustments.createdAt));
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  return {
    awaitingConfirmation: awaitingConfirmation.map((b) => ({ id: b.id, code: b.code, status: b.status, expected: b.quoteTotal ? b.quoteTotal - share(b.quoteTotal, b.commissionBps) : null })),
    scheduled: sum(items.filter((x) => x.status === 'scheduled' || x.status === 'held')),
    scheduledItems: items.filter((x) => x.status === 'scheduled' || x.status === 'held').map((x) => ({ id: x.id, bookingId: x.bookingId, amount: x.amount, dueAt: x.dueAt, status: x.status, due: x.dueAt.getTime() <= now })),
    inBatch: sum(items.filter((x) => x.status === 'in_batch')),
    paid: sum(items.filter((x) => x.status === 'paid')),
    jobs: jobs.map((b) => ({
      id: b.id,
      code: b.code,
      status: b.status,
      customerPaid: (b.quoteTotal ?? b.visitFee) - b.refundTotal,
      commissionBps: b.commissionBps,
      commission: b.commissionAmount,
      net: b.technicianNet,
      payoutDueAt: b.payoutDueAt,
      date: b.windowStart,
    })),
    payouts: pays.map((p) => ({ id: p.id, amount: p.amount, status: p.status, bankReference: p.bankReference, paidAt: p.paidAt, createdAt: p.createdAt })),
    adjustments: adj.map((a) => ({ id: a.id, amount: a.amount, reason: a.reason, createdAt: a.createdAt })),
  };
}

export async function requestDeletion(ctx: Ctx, userId: string) {
  const open = await ctx.db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.technicianId, userId), inArray(bookings.status, [...ACTIVE_STATUSES, 'confirmed', 'settled'])));
  const unpaid = await ctx.db.select({ id: payableItems.id }).from(payableItems).where(and(eq(payableItems.technicianId, userId), inArray(payableItems.status, ['scheduled', 'held', 'in_batch'])));
  if (open.length || unpaid.length) throw conflict('open_jobs');
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(technicians)
      .set({ status: 'banned', available: false, bookingSlug: null, bio: null, publicName: null, photoFileId: null, workPhotoIds: [], referencesEnc: null, emergencyContactEnc: null, draft: {}, internalNotes: 'deleted on request' })
      .where(eq(technicians.userId, userId));
    await tx.update(users).set({ status: 'deleted', displayName: null, emailEnc: null, emailIndex: null, deletedAt: new Date(ctx.clock.now()) }).where(eq(users.id, userId));
    await audit(tx, { id: userId, role: 'technician' }, { action: 'account.delete', entity: 'user', entityId: userId, data: { note: 'identity documents kept per retention setting (LEGAL GATE)' } });
  });
  await logoutEverywhere(ctx, userId, 'deleted');
}

// ---------------------------------------------------------------- admin decisions (§9.2 #2)

export async function decideApplication(
  ctx: Ctx,
  admin: Actor,
  userId: string,
  i: { decision: 'approve' | 'needs_info' | 'reject' | 'in_review'; reason: string; items?: string[]; rejectCode?: string | null; checklist?: Record<string, boolean> },
) {
  if (!i.reason.trim()) throw badRequest('reason_required');
  const s = await ctx.settings.all();
  await ctx.db.transaction(async (tx) => {
    const t = (await tx.select().from(technicians).where(eq(technicians.userId, userId)))[0];
    if (!t) throw notFound();
    if (!['submitted', 'in_review', 'needs_info'].includes(t.status)) throw conflict('invalid_transition');
    const now = new Date(ctx.clock.now());
    const base = { reviewedBy: admin.id, reviewedAt: now, verifierChecklist: i.checklist ?? t.verifierChecklist, updatedAt: now };
    if (i.decision === 'in_review') {
      await tx.update(technicians).set({ ...base, status: 'in_review' }).where(eq(technicians.userId, userId));
    } else if (i.decision === 'approve') {
      const slug = t.bookingSlug ?? slugify(t.fullNameEn ?? '');
      await tx.update(technicians).set({ ...base, status: 'approved_probation', approvedAt: now, probationJobsLeft: Number(s.probation_jobs), bookingSlug: slug }).where(eq(technicians.userId, userId));
      await tx.update(technicianDocuments).set({ status: 'approved', reviewedBy: admin.id }).where(and(eq(technicianDocuments.technicianId, userId), eq(technicianDocuments.status, 'pending')));
      await tx.update(technicianBank).set({ verifiedAt: now }).where(eq(technicianBank.technicianId, userId));
      await notify(ctx, tx, { userId, key: 'approved' });
    } else if (i.decision === 'needs_info') {
      await tx.update(technicians).set({ ...base, status: 'needs_info', needsInfo: i.items ?? [], needsInfoMessage: i.reason }).where(eq(technicians.userId, userId));
      await notify(ctx, tx, { userId, key: 'needs_info', vars: { what: i.reason } });
    } else {
      await tx.update(technicians).set({ ...base, status: 'rejected', rejectReason: i.reason }).where(eq(technicians.userId, userId));
      await notify(ctx, tx, { userId, key: 'rejected', vars: { reason: i.reason, days: Number(s.reapply_after_days) } });
    }
    await audit(tx, admin, { action: `application.${i.decision}`, entity: 'technician', entityId: userId, reason: i.reason, before: { status: t.status }, after: { status: i.decision } });
  });
}

/** Re-open a rejected application after the waiting period (§6). */
export async function reapply(ctx: Ctx, userId: string) {
  const t = await ensureTechnician(ctx, userId);
  const s = await ctx.settings.all();
  if (t.status !== 'rejected') throw conflict('invalid_transition');
  if (t.reviewedAt && t.reviewedAt.getTime() + Number(s.reapply_after_days) * 86_400_000 > ctx.clock.now()) throw conflict('too_soon');
  await ctx.db.update(technicians).set({ status: 'draft', rejectReason: null }).where(eq(technicians.userId, userId));
}

export async function pendingTerms(ctx: Ctx, userId: string) {
  return pendingAcceptances(ctx.db, userId, 'technician');
}
