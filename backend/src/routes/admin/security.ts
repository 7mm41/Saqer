import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuthContext } from '../../auth.ts';
import { sessions, signInFailures } from '../../db/schema.ts';
import { live } from '../../lib/live.ts';
import { emailIndex } from '../../lib/people.ts';

/**
 * The owner's sign-in history: each sign-in (when, device, address, app or control
 * panel) and each wrong password given for the account. A sign-in the owner doesn't
 * recognise can be ended here.
 */
export async function securityAdminRoutes(admin: FastifyInstance) {
  const { db } = admin;
  const adminOnly = { preHandler: admin.guard('admin') };

  admin.get('/security/sign-ins', adminOnly, async (request) => {
    const { user, sessionId } = requireAuthContext(request);
    const [signIns, failures] = await Promise.all([
      db.select().from(sessions).where(eq(sessions.userId, user.id)).orderBy(desc(sessions.createdAt)).limit(30),
      db.select().from(signInFailures).where(eq(signInFailures.emailIndex, emailIndex(user.email))).orderBy(desc(signInFailures.createdAt)).limit(30),
    ]);
    const current = signIns.find((row) => row.id === sessionId);
    // "Last sign-in to the control panel": the one before this one.
    const previousPanel = signIns.find((row) => row.panel && row.id !== sessionId && (!current || row.createdAt <= current.createdAt));
    const since = previousPanel?.createdAt ?? new Date(0);
    const items = [
      ...signIns.map((row) => ({
        id: row.id, kind: 'sign_in' as const, at: row.createdAt.toISOString(), device: row.userAgent, ip: row.ip,
        panel: row.panel, current: row.id === sessionId, active: row.revokedAt === null,
      })),
      ...failures.map((row) => ({
        id: `failure-${row.id}`, kind: 'wrong_password' as const, at: row.createdAt.toISOString(), device: row.userAgent, ip: row.ip,
        panel: row.panel, current: false, active: false,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
    return {
      items,
      lastPanelSignIn: previousPanel
        ? { at: previousPanel.createdAt.toISOString(), device: previousPanel.userAgent, ip: previousPanel.ip }
        : null,
      /** Wrong passwords given for this account since that sign-in. */
      failuresSinceLastSignIn: failures.filter((row) => row.createdAt > since).length,
    };
  });

  /** Ends every sign-in of the owner's account except this one (all phones and browsers). */
  admin.post('/security/sign-out-others', adminOnly, async (request) => {
    const { user, sessionId } = requireAuthContext(request);
    const ended = await db.update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    admin.live.publish(...ended.map((row) => live.revokeSession(row.id)));
    return { ended: ended.length };
  });
}
