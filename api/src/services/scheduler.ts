/**
 * Timers (§5): rows in scheduled_jobs, claimed with FOR UPDATE SKIP LOCKED.
 * Handlers must re-check state so a job that runs twice, or after a restart, does nothing wrong.
 */
import { and, eq, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { scheduledJobs } from '../db/schema';
import { newId } from '../lib/ids';
import type { Ctx } from '../ctx';

export type JobHandler = (ctx: Ctx, job: { id: string; entityId: string; payload: Record<string, unknown> }) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(kind: string, fn: JobHandler) {
  handlers.set(kind, fn);
}

export async function schedule(tx: DbOrTx, kind: string, entityId: string, dueAt: Date | number, payload: Record<string, unknown> = {}, dedupe?: string) {
  const due = typeof dueAt === 'number' ? new Date(dueAt) : dueAt;
  await tx
    .insert(scheduledJobs)
    .values({ id: newId(), kind, entityId, dueAt: due, payload, dedupeKey: dedupe ?? `${kind}:${entityId}:${due.getTime()}` })
    .onConflictDoNothing();
}

export async function cancelJobs(tx: DbOrTx, kind: string, entityId: string) {
  await tx
    .update(scheduledJobs)
    .set({ status: 'cancelled' })
    .where(and(eq(scheduledJobs.kind, kind), eq(scheduledJobs.entityId, entityId), eq(scheduledJobs.status, 'pending')));
}

/** Run every job that is due. Returns how many ran. */
export async function runDueJobs(ctx: Ctx, limit = 50): Promise<number> {
  const now = new Date(ctx.clock.now());
  const claimed = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(scheduledJobs)
      .where(and(eq(scheduledJobs.status, 'pending'), lte(scheduledJobs.dueAt, now)))
      .orderBy(scheduledJobs.dueAt)
      .limit(limit)
      .for('update', { skipLocked: true });
    for (const r of rows) await tx.update(scheduledJobs).set({ status: 'running', lockedAt: now, attempts: sql`${scheduledJobs.attempts} + 1` }).where(eq(scheduledJobs.id, r.id));
    return rows;
  });
  for (const job of claimed) {
    const h = handlers.get(job.kind);
    try {
      if (!h) throw new Error(`no handler for ${job.kind}`);
      await h(ctx, { id: job.id, entityId: job.entityId, payload: job.payload });
      await ctx.db.update(scheduledJobs).set({ status: 'done' }).where(eq(scheduledJobs.id, job.id));
    } catch (err) {
      const attemptsSoFar = job.attempts + 1;
      const retry = attemptsSoFar < 5;
      ctx.log.error({ job: job.kind, entity: job.entityId, err: String((err as Error).message) }, 'job failed');
      await ctx.db
        .update(scheduledJobs)
        .set({ status: retry ? 'pending' : 'failed', lastError: String((err as Error).message).slice(0, 500), dueAt: new Date(ctx.clock.now() + 60_000 * 2 ** attemptsSoFar) })
        .where(eq(scheduledJobs.id, job.id));
    }
  }
  return claimed.length;
}

/** Jobs left in "running" by a crash are put back (resumable after restart). */
export async function recoverStuckJobs(ctx: Ctx) {
  await ctx.db
    .update(scheduledJobs)
    .set({ status: 'pending' })
    .where(and(eq(scheduledJobs.status, 'running'), lte(scheduledJobs.lockedAt, new Date(ctx.clock.now() - 5 * 60_000))));
}

export function startScheduler(ctx: Ctx): () => void {
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await recoverStuckJobs(ctx);
      while ((await runDueJobs(ctx)) > 0 && !stopped) {
        /* drain */
      }
    } catch (e) {
      ctx.log.error({ err: String(e) }, 'scheduler tick failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, ctx.config.SCHEDULER_INTERVAL_MS);
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
