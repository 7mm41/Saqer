/**
 * Legal documents and consent (§11). Publishing renders {{variables}} from settings into a
 * snapshot; a consent stores the SHA-256 of exactly that snapshot.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderTemplate, templateVariables, renderSettingValue } from '@katf/shared';
import type { Ctx, Actor } from '../ctx';
import type { DbOrTx } from '../db';
import { consents, legalDocuments } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { badRequest, forbidden } from '../lib/errors';
import { newId } from '../lib/ids';
import { audit } from './audit';

export const DOC_TYPES = ['technician_agreement', 'code_of_conduct', 'cancellation_refund', 'customer_terms', 'privacy'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const REQUIRED: Record<'customer' | 'technician', DocType[]> = {
  customer: ['customer_terms', 'cancellation_refund'],
  technician: ['technician_agreement', 'code_of_conduct', 'cancellation_refund', 'privacy'],
};

export const TITLES: Record<DocType, { ar: string; en: string }> = {
  technician_agreement: { ar: 'اتفاقية الفني', en: 'Technician agreement' },
  code_of_conduct: { ar: 'مدونة السلوك والسلامة', en: 'Code of conduct and safety' },
  cancellation_refund: { ar: 'سياسة الإلغاء والاسترداد', en: 'Cancellation and refund policy' },
  customer_terms: { ar: 'شروط استخدام الزبون', en: 'Customer terms of use' },
  privacy: { ar: 'سياسة الخصوصية', en: 'Privacy policy' },
};

const here = dirname(fileURLToPath(import.meta.url));
export function draftBody(type: DocType): string {
  const dir = process.env.LEGAL_SEED_DIR ?? join(here, '..', 'seed', 'legal');
  return readFileSync(join(dir, `${type}.ar.md`), 'utf8').trim();
}

function snapshotFor(body: string, values: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of templateVariables(body)) out[k] = values[k] ?? null;
  return out;
}

export async function seedLegalDrafts(ctx: Ctx) {
  const values = await ctx.settings.all();
  for (const type of DOC_TYPES) {
    const exists = await ctx.db.select({ id: legalDocuments.id }).from(legalDocuments).where(eq(legalDocuments.type, type)).limit(1);
    if (exists.length) continue;
    const body = draftBody(type);
    await ctx.db.insert(legalDocuments).values({
      id: newId(),
      type,
      language: 'ar',
      version: '0.1',
      title: TITLES[type].ar,
      body,
      renderedBody: renderTemplate(body, values),
      isDraft: true,
      status: 'published',
      publishedAt: new Date(ctx.clock.now()),
      effectiveAt: new Date(ctx.clock.now()),
      requiresReacceptance: false,
      changeSummary: 'مسودة أولى — بانتظار مراجعة المحامي',
      settingsSnapshot: snapshotFor(body, values),
    });
  }
}

export async function currentDoc(db: DbOrTx, type: DocType, language: 'ar' | 'en' = 'ar') {
  const rows = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.type, type), eq(legalDocuments.language, language), eq(legalDocuments.status, 'published')))
    .orderBy(desc(legalDocuments.publishedAt))
    .limit(1);
  if (rows[0] || language === 'ar') return rows[0] ?? null;
  return currentDoc(db, type, 'ar');
}

export async function docVersions(db: DbOrTx, type: DocType) {
  return db
    .select({ id: legalDocuments.id, version: legalDocuments.version, language: legalDocuments.language, publishedAt: legalDocuments.publishedAt, status: legalDocuments.status, isDraft: legalDocuments.isDraft, changeSummary: legalDocuments.changeSummary })
    .from(legalDocuments)
    .where(eq(legalDocuments.type, type))
    .orderBy(desc(legalDocuments.createdAt));
}

/** Documents this user still has to accept (never accepted, or a newer version requires re-acceptance). */
export async function pendingAcceptances(db: DbOrTx, userId: string, role: 'customer' | 'technician') {
  const pending: { type: DocType; id: string; version: string; title: string; changeSummary: string | null; effectiveAt: Date | null; reacceptance: boolean }[] = [];
  const mine = await db.select().from(consents).where(and(eq(consents.userId, userId), isNull(consents.withdrawnAt)));
  for (const type of REQUIRED[role]) {
    const doc = await currentDoc(db, type);
    if (!doc) continue;
    const accepted = mine.filter((c) => c.docType === type);
    const hasCurrent = accepted.some((c) => c.legalDocumentId === doc.id);
    if (hasCurrent) continue;
    if (accepted.length === 0 || doc.requiresReacceptance)
      pending.push({ type, id: doc.id, version: doc.version, title: doc.title, changeSummary: doc.changeSummary, effectiveAt: doc.effectiveAt, reacceptance: accepted.length > 0 });
  }
  return pending;
}

export async function recordConsents(
  tx: DbOrTx,
  i: {
    userId: string;
    docIds: string[];
    context: 'registration' | 'booking' | 're-acceptance' | 'marketing';
    ipHash: string | null;
    userAgent: string | null;
    locale: string;
    signatureName?: string | null;
    signatureFileId?: string | null;
    bookingId?: string | null;
  },
) {
  const out: string[] = [];
  for (const docId of i.docIds) {
    const doc = (await tx.select().from(legalDocuments).where(eq(legalDocuments.id, docId)))[0];
    if (!doc || doc.status !== 'published' || !doc.renderedBody) throw badRequest('terms_required');
    const id = newId();
    await tx.insert(consents).values({
      id,
      userId: i.userId,
      legalDocumentId: doc.id,
      docType: doc.type,
      version: doc.version,
      ipHash: i.ipHash,
      userAgent: i.userAgent?.slice(0, 300) ?? null,
      locale: i.locale,
      textSha256: sha256(doc.renderedBody),
      signatureName: doc.type === 'technician_agreement' ? i.signatureName ?? null : null,
      signatureFileId: doc.type === 'technician_agreement' ? i.signatureFileId ?? null : null,
      context: i.context,
      bookingId: i.bookingId ?? null,
    });
    out.push(id);
  }
  return out;
}

/** The documents of `role` must all be current ids in `docIds`. */
export async function assertAcceptsCurrent(db: DbOrTx, types: DocType[], docIds: string[]) {
  for (const t of types) {
    const doc = await currentDoc(db, t);
    if (!doc || !docIds.includes(doc.id)) throw badRequest('terms_required', { missing: t });
  }
}

function nextVersion(prev: string | undefined): string {
  if (!prev) return '1.0';
  const [maj, min] = prev.split('.').map(Number) as [number, number];
  return `${maj}.${(min ?? 0) + 1}`;
}

export async function publishVersion(
  ctx: Ctx,
  actor: Actor,
  i: { type: DocType; language: 'ar' | 'en'; title: string; body: string; requiresReacceptance: boolean; changeSummary: string; effectiveAt?: Date | null; lawyerApproved?: boolean; reason: string },
) {
  if (i.lawyerApproved && actor.adminRole !== 'owner') throw forbidden();
  if (!i.reason?.trim()) throw badRequest('reason_required');
  const values = await ctx.settings.all();
  return ctx.db.transaction(async (tx) => {
    const prev = (await tx.select().from(legalDocuments).where(and(eq(legalDocuments.type, i.type), eq(legalDocuments.language, i.language))).orderBy(desc(legalDocuments.createdAt)).limit(1))[0];
    const id = newId();
    const rendered = renderTemplate(i.body, values);
    await tx
      .update(legalDocuments)
      .set({ status: 'superseded' })
      .where(and(eq(legalDocuments.type, i.type), eq(legalDocuments.language, i.language), eq(legalDocuments.status, 'published')));
    await tx.insert(legalDocuments).values({
      id,
      type: i.type,
      language: i.language,
      version: nextVersion(prev?.version),
      title: i.title,
      body: i.body,
      renderedBody: rendered,
      isDraft: !i.lawyerApproved,
      status: 'published',
      publishedAt: new Date(ctx.clock.now()),
      effectiveAt: i.effectiveAt ?? new Date(ctx.clock.now()),
      requiresReacceptance: i.requiresReacceptance,
      changeSummary: i.changeSummary,
      publishedBy: actor.id,
      settingsSnapshot: snapshotFor(i.body, values),
    });
    await audit(tx, actor, { action: 'legal.publish', entity: 'legal_document', entityId: id, reason: i.reason, after: { type: i.type, version: nextVersion(prev?.version), draft: !i.lawyerApproved } });
    return id;
  });
}

/** Published documents whose variables no longer match the settings (§11 "documents out of date"). */
export async function outOfDateDocuments(ctx: Ctx) {
  const values = await ctx.settings.all();
  const out: { type: string; language: string; version: string; changed: { key: string; was: string; now: string }[] }[] = [];
  const docs = await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.status, 'published'));
  for (const d of docs) {
    const snap = d.settingsSnapshot ?? {};
    const changed = Object.keys(snap)
      .filter((k) => JSON.stringify(snap[k]) !== JSON.stringify(values[k] ?? null))
      .map((k) => ({ key: k, was: renderSettingValue(k, snap[k]), now: renderSettingValue(k, values[k]) }));
    if (changed.length) out.push({ type: d.type, language: d.language, version: d.version, changed });
  }
  return out;
}

export async function anyRequiredDraft(db: DbOrTx) {
  for (const t of DOC_TYPES) {
    const d = await currentDoc(db, t);
    if (!d || d.isDraft) return true;
  }
  return false;
}
