import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { normaliseOmanPhone, renderSettingValue, SETTINGS } from '@katf/shared';
import type { Ctx } from '../ctx';
import { areas, serviceCatalog, waitlistEntries, legalDocuments, supportTickets } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { availableSlots, checkCoverage, syncPayment } from '../services/bookings';
import { readSignedFile, signedFileUrl } from '../services/files';
import { currentDoc, docVersions, DOC_TYPES, TITLES, type DocType } from '../services/legal';
import { publicTechnician } from '../services/technicians';
import { notifyAdmins } from '../services/notifications';
import type { MockPayments } from '../providers';
import { onPaymentPaid } from '../services/bookings';
import { isOwnUrl } from '../lib/urls';

/** Settings safe to show publicly (numbers used on public pages and in the booking flow). */
const PUBLIC_KEYS = SETTINGS.filter((s) => s.group !== 'security' && !['registration_allowlist', 'sms_allowlist', 'work_status_documents', 'banks'].includes(s.key)).map((s) => s.key);

export function publicRoutes(app: FastifyInstance, ctx: Ctx) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/health', async () => ({ ok: true, db: ctx.handle.kind, time: new Date(ctx.clock.now()).toISOString() }));

  r.get('/api/config', async () => {
    const v = await ctx.settings.all();
    const out: Record<string, unknown> = {};
    for (const k of PUBLIC_KEYS) out[k] = v[k];
    return {
      settings: out,
      rendered: Object.fromEntries(PUBLIC_KEYS.map((k) => [k, renderSettingValue(k, v[k])])),
      demoMode: ctx.config.DEMO_MODE,
      paymentsLive: ctx.providers.payments.live && Boolean(v.legal_gate_cleared),
      paymentProvider: ctx.providers.payments.name,
      mapTileUrl: ctx.config.MAP_TILE_URL,
      vapidPublicKey: ctx.config.VAPID_PUBLIC_KEY ?? null,
      banks: v.banks,
      publicOrigin: ctx.config.PUBLIC_ORIGIN,
    };
  });

  r.get('/api/areas', async () => {
    const rows = await ctx.db.select().from(areas).orderBy(asc(areas.sort), asc(areas.nameAr));
    return rows.map((a) => ({ wilayat: a.wilayat, nameAr: a.nameAr, nameEn: a.nameEn, active: a.active, visitFeeOverride: a.visitFeeOverride, neighbourhoods: a.active ? a.neighbourhoods : [] }));
  });

  r.get('/api/catalog', async () => {
    const rows = await ctx.db.select().from(serviceCatalog).where(eq(serviceCatalog.active, true)).orderBy(asc(serviceCatalog.sort));
    return rows;
  });

  r.post('/api/waitlist', { schema: { body: z.object({ phone: z.string(), wilayat: z.string().max(40) }) }, config: { rateLimit: { max: 5 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '1 hour' } } }, async (req) => {
    const phone = normaliseOmanPhone(req.body.phone);
    if (!phone) throw badRequest('invalid_phone');
    const idx = ctx.crypto.blindIndex('phone', phone);
    const exists = await ctx.db.select({ id: waitlistEntries.id }).from(waitlistEntries).where(and(eq(waitlistEntries.phoneIndex, idx), eq(waitlistEntries.wilayat, req.body.wilayat)));
    if (!exists.length) {
      await ctx.db.insert(waitlistEntries).values({ id: newId(), wilayat: req.body.wilayat, phoneEnc: ctx.crypto.encrypt(phone), phoneIndex: idx });
      const a = (await ctx.db.select().from(areas).where(eq(areas.wilayat, req.body.wilayat)))[0];
      if (a) await ctx.db.update(areas).set({ waitlistCount: a.waitlistCount + 1 }).where(eq(areas.wilayat, a.wilayat));
    }
    return { ok: true };
  });

  r.post('/api/contact', { schema: { body: z.object({ name: z.string().min(1).max(80), message: z.string().min(5).max(2000) }) }, config: { rateLimit: { max: 3 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '1 hour' } } }, async (req) => {
    await ctx.db.insert(supportTickets).values({
      id: newId(),
      userId: 'contact-form',
      userRole: 'visitor',
      subject: `رسالة من ${req.body.name.slice(0, 40)}`,
      messages: [{ by: 'visitor', role: 'visitor', body: req.body.message, at: new Date(ctx.clock.now()).toISOString() }],
    });
    await notifyAdmins(ctx, ctx.db, ['owner', 'support'], 'رسالة جديدة من نموذج التواصل');
    return { ok: true };
  });

  r.get('/api/coverage', { schema: { querystring: z.object({ wilayat: z.string(), neighbourhood: z.string(), lat: z.coerce.number(), lng: z.coerce.number() }) } }, async (req) => {
    const c = await checkCoverage(ctx.db, req.query);
    return c.ok ? { ok: true } : { ok: false, reason: c.reason };
  });

  r.get('/api/slots', { schema: { querystring: z.object({ slug: z.string().optional(), wilayat: z.string().optional(), neighbourhood: z.string().optional() }) } }, async (req) => {
    let technicianId: string | null = null;
    if (req.query.slug) {
      const t = await publicTechnician(ctx, req.query.slug);
      if (!t) throw notFound();
      technicianId = t.id;
    }
    return availableSlots(ctx, { technicianId, wilayat: req.query.wilayat, neighbourhood: req.query.neighbourhood });
  });

  r.get('/api/technicians/:slug', { schema: { params: z.object({ slug: z.string().max(60) }) } }, async (req) => {
    const t = await publicTechnician(ctx, req.params.slug);
    if (!t) throw notFound();
    return {
      ...t,
      id: undefined,
      photoUrl: t.photoFileId ? signedFileUrl(ctx, t.photoFileId, 3600) : null,
      workPhotos: t.workPhotoIds.map((id) => signedFileUrl(ctx, id, 3600)),
      photoFileId: undefined,
      workPhotoIds: undefined,
    };
  });

  r.get('/api/legal', async () => {
    const out = [];
    for (const t of DOC_TYPES) {
      const d = await currentDoc(ctx.db, t);
      if (d) out.push({ type: t, id: d.id, version: d.version, title: d.title, isDraft: d.isDraft, publishedAt: d.publishedAt, titleEn: TITLES[t].en });
    }
    return out;
  });

  r.get('/api/legal/:type', { schema: { params: z.object({ type: z.enum(DOC_TYPES) }), querystring: z.object({ lang: z.enum(['ar', 'en']).default('ar') }) } }, async (req) => {
    const d = await currentDoc(ctx.db, req.params.type as DocType, req.query.lang);
    if (!d) throw notFound();
    return {
      id: d.id,
      type: d.type,
      language: d.language,
      version: d.version,
      title: d.title,
      body: d.renderedBody,
      isDraft: d.isDraft,
      publishedAt: d.publishedAt,
      effectiveAt: d.effectiveAt,
      changeSummary: d.changeSummary,
      versions: await docVersions(ctx.db, req.params.type as DocType),
    };
  });

  r.get('/api/legal/version/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const d = (await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.id, req.params.id)))[0];
    if (!d || !d.publishedAt) throw notFound();
    return { id: d.id, type: d.type, version: d.version, title: d.title, body: d.renderedBody, isDraft: d.isDraft, publishedAt: d.publishedAt, status: d.status };
  });

  r.get('/api/files/:id', { schema: { params: z.object({ id: z.string().uuid() }), querystring: z.object({ exp: z.string(), sig: z.string() }) } }, async (req, reply) => {
    const f = await readSignedFile(ctx, req.params.id, req.query.exp, req.query.sig);
    reply.header('content-type', f.mime).header('cache-control', 'private, max-age=300').header('x-content-type-options', 'nosniff').header('content-disposition', 'inline');
    return reply.send(f.data);
  });

  // payment return: re-check with the provider (the webhook may not have arrived yet)
  r.post('/api/payments/:id/sync', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => ({ status: await syncPayment(ctx, req.params.id) }));

  // ---------------------------------------------------------------- mock provider's hosted page (tests and pilot only)
  if (ctx.providers.payments.name === 'mock') {
    const mock = ctx.providers.payments as MockPayments;
    r.get('/api/mock-pay/:ref', { schema: { params: z.object({ ref: z.string() }), querystring: z.object({ sig: z.string(), ok: z.string(), cancel: z.string() }) } }, async (req, reply) => {
      if (!ctx.crypto.verify(req.params.ref, req.query.sig, 'url')) throw notFound();
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دفع تجريبي</title>
<style>body{font-family:system-ui;background:#0f1b21;color:#e7f0f3;display:grid;place-items:center;min-height:100vh;margin:0}main{box-sizing:border-box;background:#16262e;padding:28px;border-radius:20px;max-width:360px;width:calc(100% - 32px);border:1px solid #2b424c}h1{font-size:20px}p{color:#9db5bf}button{display:block;width:100%;padding:14px;border-radius:12px;border:0;font:inherit;font-weight:600;margin-top:12px;cursor:pointer}.pay{background:#e08a4f;color:#10303a}.fail{background:transparent;color:#e7f0f3;border:1px solid #2b424c}</style></head>
<body><main><h1>بوابة دفع تجريبية</h1><p>هذه صفحة اختبار. لا تُدخل بيانات بطاقة حقيقية ولا يُسحب أي مبلغ.</p>
<form method="post" action="/api/mock-pay/${esc(req.params.ref)}/complete?sig=${esc(req.query.sig)}"><input type="hidden" name="ok" value="${esc(req.query.ok)}"><input type="hidden" name="cancel" value="${esc(req.query.cancel)}">
<button class="pay" name="result" value="paid">ادفع (تجريبي)</button><button class="fail" name="result" value="cancelled">إلغاء</button></form></main></body></html>`;
      // form-action also governs the redirect back to the site, so our own return origins are listed
      const back = [...new Set([ctx.config.PUBLIC_ORIGIN, ctx.config.TECH_ORIGIN])].join(' ');
      reply.header('content-type', 'text/html; charset=utf-8').header('content-security-policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${back}`);
      return reply.send(html);
    });
    r.post('/api/mock-pay/:ref/complete', { schema: { params: z.object({ ref: z.string() }), querystring: z.object({ sig: z.string() }), body: z.object({ result: z.enum(['paid', 'cancelled']), ok: z.string(), cancel: z.string() }) } }, async (req, reply) => {
      if (!ctx.crypto.verify(req.params.ref, req.query.sig, 'url')) throw notFound();
      mock.state.set(req.params.ref, req.body.result);
      const paymentId = req.params.ref.replace(/^mock_/, '');
      if (req.body.result === 'paid') await onPaymentPaid(ctx, paymentId, `${req.params.ref}_pay`);
      const target = req.body.result === 'paid' ? req.body.ok : req.body.cancel;
      if (!isOwnUrl(ctx, target)) throw badRequest('bad_return_url');
      return reply.redirect(target, 303);
    });
  }
}
