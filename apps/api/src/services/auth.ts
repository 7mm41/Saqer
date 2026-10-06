/**
 * Authentication (§13, §9.1).
 * - Customers and technicians: phone OTP, no passwords.
 * - Admins: email + argon2id password + TOTP, recovery codes.
 * - Sessions: short signed access tokens + opaque, hashed, device-bound refresh tokens rotated on use.
 */
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import * as OTPAuth from 'otpauth';
import { normaliseOmanPhone } from '@katf/shared';
import type { Ctx } from '../ctx';
import { adminAccounts, blockedIdentities, otpChallenges, sessions, signInHistory, users } from '../db/schema';
import { randomToken, safeEqual, sha256 } from '../lib/crypto';
import { AppError, badRequest, forbidden, tooMany, unauthorized } from '../lib/errors';
import { newId, otpCode } from '../lib/ids';
import { assertNotLocked, recordFailure, recordSuccess } from './attempts';
import { audit } from './audit';

export type Role = 'customer' | 'technician' | 'admin';
export type AdminRole = 'owner' | 'verifier' | 'support' | 'finance';

export interface AccessClaims {
  sid: string;
  uid: string;
  role: Role;
  arole?: AdminRole;
  exp: number;
}

const ACCESS_TTL_S = 10 * 60;
const USER_REFRESH_DAYS = 60;
const ADMIN_ABSOLUTE_H = 8;
const ADMIN_IDLE_MIN = 30;

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
let dummyHash: string | null = null;

// ---------------------------------------------------------------- tokens

export function issueAccess(ctx: Ctx, c: Omit<AccessClaims, 'exp'>): { token: string; exp: number } {
  const exp = Math.floor(ctx.clock.now() / 1000) + ACCESS_TTL_S;
  const payload = Buffer.from(JSON.stringify({ ...c, exp })).toString('base64url');
  return { token: `${payload}.${ctx.crypto.sign(payload)}`, exp };
}

export function verifyAccess(ctx: Ctx, token: string): AccessClaims | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !ctx.crypto.verify(payload, sig)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims;
    if (c.exp * 1000 < ctx.clock.now()) return null;
    return c;
  } catch {
    return null;
  }
}

export interface Tokens {
  accessToken: string;
  accessExp: number;
  refreshToken: string;
  sessionId: string;
}

async function createSession(
  ctx: Ctx,
  u: { userId: string; role: Role; adminRole?: AdminRole },
  device: { deviceId: string; deviceLabel?: string | null; ipHash?: string | null },
  familyId: string = newId(),
): Promise<Tokens> {
  const refreshToken = randomToken(32);
  const sessionId = newId();
  const now = ctx.clock.now();
  const expiresAt = new Date(u.role === 'admin' ? now + ADMIN_ABSOLUTE_H * 3600_000 : now + USER_REFRESH_DAYS * 86_400_000);
  await ctx.db.insert(sessions).values({
    id: sessionId,
    userId: u.userId,
    kind: u.role === 'admin' ? 'admin' : 'user',
    familyId,
    refreshHash: sha256(refreshToken),
    deviceId: device.deviceId.slice(0, 100),
    deviceLabel: device.deviceLabel?.slice(0, 120) ?? null,
    ipHash: device.ipHash ?? null,
    lastUsedAt: new Date(now),
    expiresAt,
  });
  const a = issueAccess(ctx, { sid: sessionId, uid: u.userId, role: u.role, ...(u.adminRole ? { arole: u.adminRole } : {}) });
  return { accessToken: a.token, accessExp: a.exp, refreshToken, sessionId };
}

/** Rotate a refresh token. Presenting an already-rotated token revokes the whole family. */
export async function refresh(ctx: Ctx, refreshToken: string, deviceId: string): Promise<Tokens> {
  const h = sha256(refreshToken);
  const r = await ctx.db.select().from(sessions).where(eq(sessions.refreshHash, h));
  const s = r[0];
  if (!s) throw unauthorized('session_expired');
  const now = ctx.clock.now();
  if (s.revokedAt) {
    if (s.revokedReason === 'rotated') {
      await ctx.db.update(sessions).set({ revokedAt: new Date(now), revokedReason: 'reuse_detected' }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
    }
    throw unauthorized('session_expired');
  }
  if (s.expiresAt.getTime() < now) throw unauthorized('session_expired');
  if (!safeEqual(s.deviceId, deviceId.slice(0, 100))) throw unauthorized('session_expired');
  if (s.kind === 'admin' && now - s.lastUsedAt.getTime() > ADMIN_IDLE_MIN * 60_000) {
    await ctx.db.update(sessions).set({ revokedAt: new Date(now), revokedReason: 'idle' }).where(eq(sessions.id, s.id));
    throw unauthorized('session_expired');
  }
  const user = (await ctx.db.select().from(users).where(eq(users.id, s.userId)))[0];
  if (!user || user.status !== 'active') throw unauthorized('session_expired');
  let adminRole: AdminRole | undefined;
  if (user.role === 'admin') {
    const acc = (await ctx.db.select().from(adminAccounts).where(eq(adminAccounts.userId, user.id)))[0];
    if (!acc?.active) throw unauthorized('session_expired');
    adminRole = acc.role as AdminRole;
  }
  await ctx.db.update(sessions).set({ revokedAt: new Date(now), revokedReason: 'rotated' }).where(eq(sessions.id, s.id));
  const next = await createSession(ctx, { userId: user.id, role: user.role as Role, adminRole }, { deviceId: s.deviceId, deviceLabel: s.deviceLabel, ipHash: s.ipHash }, s.familyId);
  if (s.kind === 'admin') {
    // keep the absolute 8-hour limit from the original sign-in
    await ctx.db.update(sessions).set({ expiresAt: s.expiresAt }).where(eq(sessions.id, next.sessionId));
  }
  return next;
}

export async function logout(ctx: Ctx, sessionId: string) {
  const s = (await ctx.db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
  if (!s) return;
  await ctx.db.update(sessions).set({ revokedAt: new Date(ctx.clock.now()), revokedReason: 'logout' }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
}

export async function logoutEverywhere(ctx: Ctx, userId: string, reason = 'logout_all', db: import('../db').DbOrTx = ctx.db) {
  await db.update(sessions).set({ revokedAt: new Date(ctx.clock.now()), revokedReason: reason }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** For admin requests: the session must still be live (instant revocation and idle timeout). */
export async function touchAdminSession(ctx: Ctx, sessionId: string): Promise<boolean> {
  const s = (await ctx.db.select().from(sessions).where(eq(sessions.id, sessionId)))[0];
  if (!s || s.revokedAt) {
    // a rotated session is still valid until its access token expires; check its family instead
    if (s?.revokedReason === 'rotated') {
      const live = await ctx.db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
      return live.length > 0;
    }
    return false;
  }
  const now = ctx.clock.now();
  if (s.expiresAt.getTime() < now || now - s.lastUsedAt.getTime() > ADMIN_IDLE_MIN * 60_000) return false;
  if (now - s.lastUsedAt.getTime() > 60_000) await ctx.db.update(sessions).set({ lastUsedAt: new Date(now) }).where(eq(sessions.id, s.id));
  return true;
}

// ---------------------------------------------------------------- OTP

async function isBlocked(ctx: Ctx, kind: string, index: string) {
  const r = await ctx.db.select({ id: blockedIdentities.id }).from(blockedIdentities).where(and(eq(blockedIdentities.kind, kind), eq(blockedIdentities.indexValue, index)));
  return r.length > 0;
}

export async function requestOtp(ctx: Ctx, i: { phone: string; role: 'customer' | 'technician'; ip?: string | null; purpose?: 'login' | 'bank_change' }) {
  const phone = normaliseOmanPhone(i.phone);
  if (!phone) throw badRequest('invalid_phone');
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const phoneIdx = ctx.crypto.blindIndex('phone', phone);
  const ipKey = `otp-ip:${ctx.crypto.hashIp(i.ip) ?? 'none'}`;
  await assertNotLocked(ctx.db, `otp:${phoneIdx}`, now);
  await assertNotLocked(ctx.db, ipKey, now);
  // per-IP send limit: count sends as soft failures (20 per lock window)
  const last = await ctx.db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phoneIndex, phoneIdx), gt(otpChallenges.createdAt, new Date(now - Number(s.otp_resend_seconds) * 1000))))
    .limit(1);
  if (last.length) throw tooMany('otp_too_soon');
  await recordFailure(ctx.db, ipKey, now, { max: 20 * ctx.config.RATE_LIMIT_SCALE, baseLockMinutes: Number(s.otp_lock_minutes), maxLockHours: Number(s.lock_max_hours) });

  const legalOpen = Boolean(s.legal_gate_cleared);
  const allow = (s.sms_allowlist as string[]).map((p) => normaliseOmanPhone(p)).filter(Boolean);
  const code = otpCode(Number(s.otp_length));
  const id = newId();
  await ctx.db.insert(otpChallenges).values({
    id,
    phoneIndex: phoneIdx,
    purpose: i.purpose === 'bank_change' ? 'bank_change' : i.role,
    codeHash: ctx.crypto.sign(`otp:${id}:${code}`),
    // set from the app clock: the resend check above compares against the same clock
    createdAt: new Date(now),
    expiresAt: new Date(now + Number(s.otp_ttl_minutes) * 60_000),
  });
  const appName = String(s.app_name);
  const body = `رمز التحقق في ${appName}: ${code}. لا تشاركه مع أحد.`;
  // Before the legal gate opens, a real SMS network may reach only allowlisted test numbers (§18).
  if (ctx.providers.sms.real && !legalOpen && !allow.includes(phone)) {
    ctx.log.warn({ provider: ctx.providers.sms.name }, 'sms blocked: number not on the test allowlist');
  } else {
    await ctx.providers.sms.send(phone, body);
  }
  return { challengeId: id, resendIn: Number(s.otp_resend_seconds), expiresIn: Number(s.otp_ttl_minutes) * 60 };
}

export async function verifyOtp(
  ctx: Ctx,
  i: { challengeId: string; phone: string; code: string; role: 'customer' | 'technician'; deviceId: string; deviceLabel?: string | null; ip?: string | null; locale?: string },
): Promise<Tokens & { userId: string; isNew: boolean }> {
  const phone = normaliseOmanPhone(i.phone);
  if (!phone) throw badRequest('invalid_phone');
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const phoneIdx = ctx.crypto.blindIndex('phone', phone);
  await assertNotLocked(ctx.db, `otp:${phoneIdx}`, now);
  const ch = (await ctx.db.select().from(otpChallenges).where(eq(otpChallenges.id, i.challengeId)))[0];
  if (!ch || ch.phoneIndex !== phoneIdx || ch.consumedAt || ch.purpose !== i.role) throw badRequest('otp_invalid');
  if (ch.expiresAt.getTime() < now) throw badRequest('otp_expired');
  const ok = ch.attempts < Number(s.otp_max_attempts) && ctx.crypto.verify(`otp:${ch.id}:${i.code.trim()}`, ch.codeHash);
  if (!ok) {
    await ctx.db.update(otpChallenges).set({ attempts: ch.attempts + 1 }).where(eq(otpChallenges.id, ch.id));
    const f = await recordFailure(ctx.db, `otp:${phoneIdx}`, now, { max: Number(s.otp_max_attempts), baseLockMinutes: Number(s.otp_lock_minutes), maxLockHours: Number(s.lock_max_hours) });
    if (f.locked) throw tooMany('otp_locked', { minutes: f.minutes });
    throw badRequest('otp_invalid');
  }
  await ctx.db.update(otpChallenges).set({ consumedAt: new Date(now) }).where(eq(otpChallenges.id, ch.id));
  await recordSuccess(ctx.db, `otp:${phoneIdx}`);

  if (await isBlocked(ctx, 'phone', phoneIdx)) throw forbidden('blocked');

  let user = (await ctx.db.select().from(users).where(and(eq(users.phoneIndex, phoneIdx), eq(users.role, i.role))))[0];
  let isNew = false;
  if (!user) {
    if (i.role === 'technician' && !s.legal_gate_cleared) {
      const allow = (s.registration_allowlist as string[]).map((p) => normaliseOmanPhone(p));
      if (!allow.includes(phone)) throw forbidden('registration_closed');
    }
    const id = newId();
    await ctx.db.insert(users).values({ id, role: i.role, phoneEnc: ctx.crypto.encrypt(phone), phoneIndex: phoneIdx, locale: i.locale === 'en' ? 'en' : 'ar' });
    user = (await ctx.db.select().from(users).where(eq(users.id, id)))[0]!;
    isNew = true;
  }
  if (user.status !== 'active') throw forbidden('blocked');
  const ipHash = ctx.crypto.hashIp(i.ip);
  await ctx.db.update(users).set({ lastLoginAt: new Date(now), lastLoginIpHash: ipHash }).where(eq(users.id, user.id));
  const t = await createSession(ctx, { userId: user.id, role: i.role }, { deviceId: i.deviceId, deviceLabel: i.deviceLabel, ipHash });
  return { ...t, userId: user.id, isNew };
}

/** Confirms a step-up OTP (e.g. changing bank details) for a signed-in user's own phone. Same attempt limits and locks as sign-in. */
export async function consumeStepUpOtp(ctx: Ctx, i: { userId: string; challengeId: string; code: string; purpose: 'bank_change' }) {
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const u = (await ctx.db.select().from(users).where(eq(users.id, i.userId)))[0];
  const phone = u ? normaliseOmanPhone(ctx.crypto.decrypt(u.phoneEnc) ?? '') : null;
  if (!phone) throw badRequest('otp_invalid');
  const phoneIdx = ctx.crypto.blindIndex('phone', phone);
  await assertNotLocked(ctx.db, `otp:${phoneIdx}`, now);
  const ch = (await ctx.db.select().from(otpChallenges).where(eq(otpChallenges.id, i.challengeId)))[0];
  if (!ch || ch.phoneIndex !== phoneIdx || ch.consumedAt || ch.purpose !== i.purpose) throw badRequest('otp_invalid');
  if (ch.expiresAt.getTime() < now) throw badRequest('otp_expired');
  const ok = ch.attempts < Number(s.otp_max_attempts) && ctx.crypto.verify(`otp:${ch.id}:${i.code.trim()}`, ch.codeHash);
  if (!ok) {
    await ctx.db.update(otpChallenges).set({ attempts: ch.attempts + 1 }).where(eq(otpChallenges.id, ch.id));
    const f = await recordFailure(ctx.db, `otp:${phoneIdx}`, now, { max: Number(s.otp_max_attempts), baseLockMinutes: Number(s.otp_lock_minutes), maxLockHours: Number(s.lock_max_hours) });
    if (f.locked) throw tooMany('otp_locked', { minutes: f.minutes });
    throw badRequest('otp_invalid');
  }
  await ctx.db.update(otpChallenges).set({ consumedAt: new Date(now) }).where(eq(otpChallenges.id, ch.id));
  await recordSuccess(ctx.db, `otp:${phoneIdx}`);
}

/** Sends a step-up OTP to the signed-in user's own phone. */
export async function requestStepUpOtp(ctx: Ctx, i: { userId: string; role: 'customer' | 'technician'; purpose: 'bank_change'; ip?: string | null }) {
  const u = (await ctx.db.select().from(users).where(eq(users.id, i.userId)))[0];
  const phone = u ? ctx.crypto.decrypt(u.phoneEnc) : null;
  if (!phone) throw badRequest('invalid_phone');
  const r = await requestOtp(ctx, { phone, role: i.role, ip: i.ip ?? null, purpose: i.purpose });
  return { challengeId: r.challengeId, resendIn: r.resendIn, expiresIn: r.expiresIn };
}

// ---------------------------------------------------------------- admin

export async function hashPassword(pw: string) {
  return argonHash(pw, ARGON);
}

async function decoyVerify(pw: string) {
  dummyHash ??= await argonHash('decoy-password-for-timing', ARGON);
  await argonVerify(dummyHash, pw).catch(() => false);
}

export function newTotpSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, label: string, issuer: string) {
  return new OTPAuth.TOTP({ issuer, label, secret: OTPAuth.Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 }).toString();
}

export function checkTotp(secret: string, code: string, now: number): boolean {
  const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
  return t.validate({ token: code.replace(/\s/g, ''), timestamp: now, window: 1 }) !== null;
}

export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomToken(6).replace(/[^A-Za-z0-9]/g, 'x').slice(0, 10).toUpperCase());
}

export interface AdminSignInResult {
  status: 'ok' | 'totp_required' | 'totp_enrollment';
  tokens?: Tokens;
  enrollment?: { secret: string; uri: string };
  recoveryCodes?: string[];
}

export async function adminSignIn(
  ctx: Ctx,
  i: { email: string; password: string; totp?: string | null; recoveryCode?: string | null; enrollSecret?: string | null; deviceId: string; deviceLabel?: string | null; ip?: string | null },
): Promise<AdminSignInResult> {
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const email = i.email.trim().toLowerCase();
  const emailIdx = ctx.crypto.blindIndex('email', email);
  const ipHash = ctx.crypto.hashIp(i.ip);
  const ipKey = `admin-ip:${ipHash ?? 'none'}`;
  const lockOpts = { baseLockMinutes: Number(s.otp_lock_minutes), maxLockHours: Number(s.lock_max_hours) };
  const history = (success: boolean, reason: string, userId: string | null) =>
    ctx.db.insert(signInHistory).values({ id: newId(), userId, emailIndex: emailIdx, success, reason, ipHash, device: i.deviceLabel?.slice(0, 120) ?? null });

  await assertNotLocked(ctx.db, ipKey, now).catch(async (e) => {
    await history(false, 'ip_locked', null);
    throw e;
  });
  const user = (await ctx.db.select().from(users).where(and(eq(users.emailIndex, emailIdx), eq(users.role, 'admin'))))[0];
  const acc = user ? (await ctx.db.select().from(adminAccounts).where(eq(adminAccounts.userId, user.id)))[0] : undefined;
  const fail = async (reason: string) => {
    await recordFailure(ctx.db, ipKey, now, { max: Number(s.admin_ip_lock_attempts), ...lockOpts });
    if (acc) {
      const f = await recordFailure(ctx.db, `admin:${acc.userId}`, now, { max: Number(s.admin_lock_attempts), ...lockOpts });
      if (f.locked) await ctx.db.update(adminAccounts).set({ lockedUntil: new Date(now + f.minutes * 60_000) }).where(eq(adminAccounts.userId, acc.userId));
    }
    await history(false, reason, acc?.userId ?? null);
    throw new AppError(401, 'invalid_credentials');
  };
  if (!user || !acc || !acc.active || user.status !== 'active') {
    await decoyVerify(i.password);
    return fail('unknown');
  }
  if (acc.lockedUntil && acc.lockedUntil.getTime() > now) {
    await decoyVerify(i.password);
    await history(false, 'locked', acc.userId);
    throw tooMany('account_locked', { minutes: Math.ceil((acc.lockedUntil.getTime() - now) / 60_000) });
  }
  if (!(await argonVerify(acc.passwordHash, i.password).catch(() => false))) return fail('password');

  // First sign-in: enrol TOTP before anything else.
  if (!acc.totpEnabled) {
    if (!i.enrollSecret || !i.totp) {
      const secret = newTotpSecret();
      return { status: 'totp_enrollment', enrollment: { secret, uri: totpUri(secret, email, String(s.app_name_en || 'Katf')) } };
    }
    if (!checkTotp(i.enrollSecret, i.totp, now)) return fail('totp_enroll');
    const codes = newRecoveryCodes();
    await ctx.db
      .update(adminAccounts)
      .set({ totpSecretEnc: ctx.crypto.encrypt(i.enrollSecret), totpEnabled: true, recoveryCodes: codes.map((c) => sha256(c)) })
      .where(eq(adminAccounts.userId, acc.userId));
    const tokens = await finishAdmin(ctx, acc.userId, acc.role as AdminRole, i, ipHash);
    await history(true, 'enrolled', acc.userId);
    return { status: 'ok', tokens, recoveryCodes: codes };
  }
  if (!i.totp && !i.recoveryCode) return { status: 'totp_required' };
  let second = false;
  if (i.totp) second = checkTotp(ctx.crypto.decrypt(acc.totpSecretEnc!), i.totp, now);
  else if (i.recoveryCode) {
    const h = sha256(i.recoveryCode.trim().toUpperCase());
    if (acc.recoveryCodes.includes(h)) {
      second = true;
      await ctx.db.update(adminAccounts).set({ recoveryCodes: acc.recoveryCodes.filter((c) => c !== h) }).where(eq(adminAccounts.userId, acc.userId));
    }
  }
  if (!second) return fail('totp');
  const tokens = await finishAdmin(ctx, acc.userId, acc.role as AdminRole, i, ipHash);
  await history(true, i.recoveryCode ? 'recovery_code' : 'totp', acc.userId);
  return { status: 'ok', tokens };
}

async function finishAdmin(ctx: Ctx, userId: string, role: AdminRole, i: { deviceId: string; deviceLabel?: string | null }, ipHash: string | null) {
  const now = ctx.clock.now();
  await recordSuccess(ctx.db, `admin:${userId}`);
  await ctx.db.update(adminAccounts).set({ lastSignInAt: new Date(now), lastSignInDevice: i.deviceLabel ?? null, failedAttempts: 0, lockedUntil: null }).where(eq(adminAccounts.userId, userId));
  await ctx.db.update(users).set({ lastLoginAt: new Date(now), lastLoginIpHash: ipHash }).where(eq(users.id, userId));
  await audit(ctx.db, { id: userId, role: 'admin', adminRole: role, ipHash }, { action: 'admin.sign_in', entity: 'admin', entityId: userId });
  return createSession(ctx, { userId, role: 'admin', adminRole: role }, { deviceId: i.deviceId, deviceLabel: i.deviceLabel, ipHash });
}

export async function createAdmin(ctx: Ctx, i: { email: string; password: string; role: AdminRole; displayName: string; createdBy?: string | null }) {
  if (i.password.length < 12) throw badRequest('password_too_short');
  const email = i.email.trim().toLowerCase();
  const idx = ctx.crypto.blindIndex('email', email);
  const exists = await ctx.db.select({ id: users.id }).from(users).where(and(eq(users.emailIndex, idx), eq(users.role, 'admin')));
  if (exists.length) throw badRequest('already_registered');
  const id = newId();
  await ctx.db.insert(users).values({ id, role: 'admin', emailEnc: ctx.crypto.encrypt(email), emailIndex: idx, displayName: i.displayName });
  await ctx.db.insert(adminAccounts).values({ userId: id, passwordHash: await hashPassword(i.password), role: i.role });
  await audit(ctx.db, { id: i.createdBy ?? null, role: i.createdBy ? 'admin' : 'system' }, { action: 'admin.create', entity: 'admin', entityId: id, data: { role: i.role } });
  return id;
}

export async function listSessions(ctx: Ctx, userId?: string) {
  const q = ctx.db.select().from(sessions).where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date(ctx.clock.now())), ...(userId ? [eq(sessions.userId, userId)] : [eq(sessions.kind, 'admin')])));
  return (await q.orderBy(desc(sessions.lastUsedAt))).map((s) => ({ id: s.id, userId: s.userId, device: s.deviceLabel, lastUsedAt: s.lastUsedAt, createdAt: s.createdAt, kind: s.kind }));
}
