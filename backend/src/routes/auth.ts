import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { z } from 'zod';
import { requireAuthContext } from '../auth.ts';
import { otpCodes, sessions, users, type User } from '../db/schema.ts';
import { hashOtp, isOmaniMobile, memberNumber, normalizePhone, otpCode } from '../lib/codes.ts';
import { ApiError, errors } from '../lib/errors.ts';
import { activeMembership } from '../lib/memberships.ts';
import { live } from '../lib/live.ts';
import { hashPassword, verifyPassword } from '../lib/passwords.ts';
import { parse } from '../lib/validation.ts';
import { serializeMembership, serializeUser } from '../serializers.ts';

export const DEMO_PHONE = '91234567';
export const DEMO_OTP = '123456';
const OTP_TTL_MS = 5 * 60_000;
const OTP_RESEND_MS = 30_000;
const OTP_MAX_ATTEMPTS = 5;

const phoneSchema = z.string().transform(normalizePhone).refine(isOmaniMobile, 'Omani mobile numbers have 8 digits and start with 7 or 9.');
const password = z.string().min(8).max(200).refine((v) => /[a-zA-Z\p{L}]/u.test(v) && /\d/.test(v), 'Use letters and numbers.');

export async function authRoutes(api: FastifyInstance, limit: RouteShorthandOptions['config']) {
  const { db, tokens, config } = api;
  const options = { config: limit };

  /** Creates a session row and returns the sign-in payload. */
  async function signIn(user: User, request: FastifyRequest) {
    if (user.status !== 'active') throw errors.suspended();
    const [session] = await db.insert(sessions).values({
      userId: user.id, userAgent: request.headers['user-agent']?.slice(0, 250) ?? null,
    }).returning();
    const token = await tokens.sign({ userId: user.id, sessionId: session!.id, role: user.role });
    const active = await activeMembership(db, user.id);
    return {
      token,
      user: serializeUser(user),
      membership: active ? serializeMembership(active.membership, active.plan) : null,
    };
  }

  api.post('/auth/register', options, async (request, reply) => {
    const body = parse(z.object({
      fullName: z.string().trim().min(3).max(120),
      email: z.email().transform((v) => v.trim().toLowerCase()),
      phone: phoneSchema,
      password,
    }), request.body);

    const [emailOwner] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (emailOwner) throw errors.emailTaken();
    const [phoneOwner] = await db.select({ id: users.id }).from(users).where(eq(users.phone, body.phone)).limit(1);
    if (phoneOwner) throw errors.phoneTaken();

    const passwordHash = await hashPassword(body.password);
    let user: User | undefined;
    for (let attempt = 0; attempt < 5 && !user; attempt++) {
      try {
        [user] = await db.insert(users).values({
          fullName: body.fullName, email: body.email, phone: body.phone, passwordHash, memberNumber: memberNumber(),
        }).returning();
      } catch (error) {
        if (!String(error).includes('member_number')) throw error; // retry only a member-number collision
      }
    }
    if (!user) throw new ApiError(500, 'server_error', 'Could not create the account.');
    api.live.publish(live.admin('members'));
    return reply.status(201).send(await signIn(user, request));
  });

  api.post('/auth/login', options, async (request) => {
    const body = parse(z.object({ email: z.string().trim().toLowerCase(), password: z.string() }), request.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw errors.invalidCredentials();
    return signIn(user, request);
  });

  api.post('/auth/otp/request', options, async (request) => {
    const { phone } = parse(z.object({ phone: phoneSchema }), request.body);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (!user) throw errors.phoneNotRegistered();

    const now = Date.now();
    const recent = await db.select({ createdAt: otpCodes.createdAt }).from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, new Date(now - 60 * 60_000))))
      .orderBy(desc(otpCodes.createdAt));
    const last = recent[0];
    if (last && now - last.createdAt.getTime() < OTP_RESEND_MS) throw errors.tooManyRequests('Please wait before requesting a new code.');
    if (recent.length >= 5) throw errors.tooManyRequests('Too many codes requested. Try again later.');

    const code = config.demoMode && phone === DEMO_PHONE ? DEMO_OTP : otpCode();
    await db.insert(otpCodes).values({
      phone, codeHash: hashOtp(phone, code, config.jwtSecret), expiresAt: new Date(now + OTP_TTL_MS),
    });
    await api.sms(phone, `Sarena code: ${code}. Valid for 5 minutes. رمز سرينا: ${code}`);
    return { phone, codeLength: 6, resendAvailableAt: new Date(now + OTP_RESEND_MS).toISOString() };
  });

  api.post('/auth/otp/verify', options, async (request) => {
    const body = parse(z.object({ phone: phoneSchema, code: z.string().transform(normalizePhone) }), request.body);
    const [otp] = await db.select().from(otpCodes)
      .where(and(eq(otpCodes.phone, body.phone), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
      .orderBy(desc(otpCodes.createdAt)).limit(1);
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw errors.invalidCode();
    if (otp.codeHash !== hashOtp(body.phone, body.code, config.jwtSecret)) {
      await db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
      throw errors.invalidCode();
    }
    await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, otp.id));
    const [user] = await db.select().from(users).where(eq(users.phone, body.phone)).limit(1);
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
