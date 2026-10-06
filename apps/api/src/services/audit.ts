/**
 * Append-only, hash-chained audit log. row_hash = sha256(prev_hash | canonical row).
 * The database refuses UPDATE/DELETE on this table (migration 0001).
 */
import { asc, desc, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { auditLog } from '../db/schema';
import { sha256 } from '../lib/crypto';
import type { Actor } from '../ctx';

export const GENESIS = '0'.repeat(64);

export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export const stateHash = (v: unknown) => (v == null ? null : sha256(canonical(v)));

export async function audit(
  tx: DbOrTx,
  actor: Actor,
  e: { action: string; entity: string; entityId?: string | null; reason?: string | null; before?: unknown; after?: unknown; data?: Record<string, unknown> },
  at = new Date(),
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(727274)`);
  const last = await tx.select({ rowHash: auditLog.rowHash }).from(auditLog).orderBy(desc(auditLog.id)).limit(1);
  const prevHash = last[0]?.rowHash ?? GENESIS;
  const row = {
    actorId: actor.id,
    actorRole: actor.adminRole ? `admin:${actor.adminRole}` : actor.role,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    reason: e.reason ?? null,
    beforeHash: stateHash(e.before),
    afterHash: stateHash(e.after),
    ipHash: actor.ipHash ?? null,
    data: e.data ?? null,
    createdAt: at.toISOString(),
  };
  const rowHash = sha256(prevHash + '|' + canonical(row));
  await tx.insert(auditLog).values({ ...row, createdAt: at, prevHash, rowHash });
}

/** Recompute the chain; returns the id of the first broken row, or null. */
export async function verifyAudit(db: DbOrTx): Promise<{ ok: boolean; checked: number; brokenAt: number | null }> {
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.id));
  let prev = GENESIS;
  for (const r of rows) {
    const row = {
      actorId: r.actorId,
      actorRole: r.actorRole,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      reason: r.reason,
      beforeHash: r.beforeHash,
      afterHash: r.afterHash,
      ipHash: r.ipHash,
      data: r.data,
      createdAt: r.createdAt.toISOString(),
    };
    if (r.prevHash !== prev || sha256(prev + '|' + canonical(row)) !== r.rowHash) return { ok: false, checked: rows.length, brokenAt: r.id };
    prev = r.rowHash;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}
