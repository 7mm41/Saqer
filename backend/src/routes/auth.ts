import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { z } from 'zod';
import { fromPanel, requireAuthContext } from '../auth.ts';
import { otpCodes, sessions, signInFailures, users, type User } from '../db/schema.ts';
import { AttemptLimiter } from '../lib/attempts.ts';
import { hashOtp, memberNumber, normalizePhone, otpCode } from '../lib/codes.ts';
import { ApiError, errors } from '../lib/errors.ts';
import { emailIndex, phoneIndex } from '../lib/people.ts';
import { activeMembership } from '../lib/memberships.ts';
import { live } from '../lib/live.ts';
import { hashPassword, verifyPassword } from '../lib/passwords.ts';
import { newPassword as password, parse, phoneSchema } from '../lib/validation.ts';
import { serializeMembership, serializeUser } from '../serializers.ts';

const OTP_TTL_MS = 5 * 60_000;
const OTP_RESEND_MS = 30_000;
const OTP_MAX_ATTEMPTS = 5;

export async function authRoutes(api: FastifyInstance, limit: RouteShorthandOptions['config']) {
  const { db, tokens, config } = api;
  const options = { config: limit };
  // Wrong passwords and SMS codes lock the email / number (5 tries, then 15 min, 30 min…
  // up to a day) and the address they come from (20 tries), wherever the guesses come from.
  const accountAttempts = new AttemptLimiter({ maxFailures: 5 });
  const codeAttempts = new AttemptLimiter({ maxFailures: 10 });
  const addressAttempts = new AttemptLimiter({ maxFailures: 20 });
  // Checked when the email has no account, so a wrong email takes as long as a wrong password.
  const decoyHash = hashPassword(randomBytes(16).toString('hex'));

  /** 429 while any of `keys` is locked. */
  function checkLocks(limiter: AttemptLimiter, key: string, request: FastifyRequest) {
    const wait = Math.max(limiter.lockedFor(key), addressAttempts.lockedFor(`ip:${request.ip}`));
    if (wait > 0) throw errors.tooManyAttempts(wait);
  }

  function failed(limiter: AttemptLimiter, key: string, request: FastifyRequest) {
    limiter.fail(key);
    addressAttempts.fail(`ip:${request.ip}`);
  }

  /** Creates a session row and returns the sign-in payload. */
  async function signIn(user: User, request: FastifyRequest, fromControlPanel = false) {
    if (user.status !== 'active') throw errors.suspended();
    // Only the owner, signing in from the control panel's secret address, can manage anything.
    const panel = fromControlPanel && user.role === 'admin' && user.email === config.adminEmail;
    const [session] = await db.insert(sessions).values({
      userId: user.id, userAgent: request.headers['user-agent']?.slice(0, 250) ?? null, ip: request.ip.slice(0, 64), panel,
    }).returning();
    const token = await tokens.sign({ userId: user.id, sessionId: session!.id, role: user.role, panel });
    const active = await activeMembership(db, user.id);
    return {
      token,
      user: serializeUser(user),
      membership: active ? serializeMembership(active.membership, active.plan) : null,
      panel,
    };
  }

  api.post('/auth/register', options, async (request, reply) => {
    const body = parse(z.object({
      fullName: z.string().trim().min(3).max(120),
      email: z.email().transform((v) => v.trim().toLowerCase()),
      phone: phoneSchema,
      password,
    }), request.body);

    const [emailOwner] = await db.select({ id: users.id }).from(users).where(eq(users.emailIndex, emailIndex(body.email))).limit(1);
    if (emailOwner) throw errors.emailTaken();
    const [phoneOwner] = await db.select({ id: users.id }).from(users).where(eq(users.phoneIndex, phoneIndex(body.phone))).limit(1);
    if (phoneOwner) throw errors.phoneTaken();

    const passwordHash = await hashPassword(body.password);
    let user: User | undefined;
    for (let attempt = 0; attempt < 5 && !user; attempt++) {
      try {
        [user] = await db.insert(users).values({
          fullName: body.fullName, email: body.email, emailIndex: emailIndex(body.email),
          phone: body.phone, phoneIndex: phoneIndex(body.phone), passwordHash, memberNumber: memberNumber(),
        }).returning();
      } catch (error) {
        // Retry only a member-number collision; the same email or number registering twice at once is "taken".
        if (String(error).includes('email_index')) throw errors.emailTaken();
        if (String(error).includes('phone_index')) throw errors.phoneTaken();
        if (!String(error).includes('member_number')) throw error;
      }
    }
    if (!user) throw new ApiError(500, 'server_error', 'Could not create the account.');
    api.live.publish(live.admin('members'));
    return reply.status(201).send(await signIn(user, request));
  });

  api.post('/auth/login', options, async (request) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) }), request.body);
    const panel = fromPanel(request, config.panelPath);
    // Counted apart: guesses made in the app can't lock the owner out of the control
    // panel, and the panel's own can only be made by someone who knows its address.
    const key = `${panel ? 'panel' : 'app'}:${body.email}`;
    checkLocks(accountAttempts, key, request);
    const [user] = await db.select().from(users).where(eq(users.emailIndex, emailIndex(body.email))).limit(1);
    const hash = user?.passwordHash ?? await decoyHash;
    const trimmed = body.password.trim();
    const valid = await verifyPassword(body.password, hash)
      // Phone keyboards can add a space before or after a pasted or suggested password.
      || (trimmed !== body.password && await verifyPassword(trimmed, hash));
    if (!user || !valid) {
      failed(accountAttempts, key, request);
      // Kept for the owner's account, so the control panel shows who tried to get in.
      if (body.email === config.adminEmail) {
        await db.insert(signInFailures).values({
          emailIndex: emailIndex(body.email), ip: request.ip.slice(0, 64), userAgent: request.headers['user-agent']?.slice(0, 250) ?? null, panel,
        });
        await db.delete(signInFailures).where(lt(signInFailures.createdAt, new Date(Date.now() - 90 * 86_400_000)));
      }
      throw errors.invalidCredentials();
    }
    accountAttempts.succeed(key);
    return signIn(user, request, panel);
  });

  api.post('/auth/otp/request', options, async (request) => {
    const { phone } = parse(z.object({ phone: phoneSchema }), request.body);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.phoneIndex, phoneIndex(phone))).limit(1);
    if (!user) throw errors.phoneNotRegistered();
    const phoneKey = phoneIndex(phone);

    const now = Date.now();
    const recent = await db.select({ createdAt: otpCodes.createdAt }).from(otpCodes)
      .where(and(eq(otpCodes.phone, phoneKey), gt(otpCodes.createdAt, new Date(now - 60 * 60_000))))
      .orderBy(desc(otpCodes.createdAt));
    const last = recent[0];
    if (last && now - last.createdAt.getTime() < OTP_RESEND_MS) throw errors.tooManyRequests('Please wait before requesting a new code.');
    if (recent.length >= 5) throw errors.tooManyRequests('Too many codes requested. Try again later.');

    const code = otpCode();
    await db.insert(otpCodes).values({
      phone: phoneKey, codeHash: hashOtp(phone, code, config.jwtSecret), expiresAt: new Date(now + OTP_TTL_MS),
    });
    await api.sms(phone, `Sarena code: ${code}. Valid for 5 minutes. رمز سرينا: ${code}`);
    return { phone, codeLength: 6, resendAvailableAt: new Date(now + OTP_RESEND_MS).toISOString() };
  });

  api.post('/auth/otp/verify', options, async (request) => {
    const body = parse(z.object({ phone: phoneSchema, code: z.string().max(20).transform(normalizePhone) }), request.body);
    const key = `otp:${body.phone}`;
    checkLocks(codeAttempts, key, request);
    const [otp] = await db.select().from(otpCodes)
      .where(and(eq(otpCodes.phone, phoneIndex(body.phone)), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
      .orderBy(desc(otpCodes.createdAt)).limit(1);
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw errors.invalidCode();
    if (otp.codeHash !== hashOtp(body.phone, body.code, config.jwtSecret)) {
      await db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
      failed(codeAttempts, key, request);
      throw errors.invalidCode();
    }
    codeAttempts.succeed(key);
    await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
    const [user] = await db.select().from(users).where(eq(users.phoneIndex, phoneIndex(body.phone))).limit(1);
    if (!user) throw errors.phoneNotRegistered();
    return signIn(user, request);
  });

  api.post('/auth/logout', { preHandler: api.guard() }, async (request) => {
    const { sessionId } = requireAuthContext(request);
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
    api.live.publish(live.revokeSession(sessionId));
    return { ok: true };
  });
}
