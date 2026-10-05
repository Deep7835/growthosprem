// A small job queue on Postgres (PRD 9), in place of Redis and BullMQ: one less service to
// run, and it works on the in-process development database too. Workers claim jobs with
// FOR UPDATE SKIP LOCKED, so several can run side by side.
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db/core";
import { jobs } from "@/db/schema";

export const PRIORITY = { publish: 0, manual: 3, sync: 5, health: 6 } as const;

/** A failure that retrying will not fix (for example a revoked token). */
export class PermanentError extends Error {}

export interface NewJob {
  kind: string;
  payload: Record<string, unknown>;
  priority?: number;
  runAt?: Date;
  /** At most one job per key, ever: e.g. one hourly sync per account per hour. */
  dedupeKey?: string;
  maxAttempts?: number;
}

export type Job = typeof jobs.$inferSelect;

/** Adds jobs; ones whose dedupe key already exists are skipped. Returns how many were added. */
export async function enqueue(db: Db, list: NewJob | NewJob[]): Promise<number> {
  const rows = (Array.isArray(list) ? list : [list]).map((j) => ({
    kind: j.kind,
    payload: j.payload,
    priority: j.priority ?? PRIORITY.sync,
    runAt: j.runAt ?? new Date(),
    dedupeKey: j.dedupeKey ?? null,
    maxAttempts: j.maxAttempts ?? 3,
  }));
  if (rows.length === 0) return 0;
  const added = await db.insert(jobs).values(rows).onConflictDoNothing({ target: jobs.dedupeKey }).returning({ id: jobs.id });
  return added.length;
}

// A job locked for longer than this is assumed to belong to a crashed worker.
const STALE_LOCK_MS = 10 * 60 * 1000;

/**
 * Claims the most urgent due job. Jobs for an account that already has one running wait,
 * so one large client cannot hold up another's (PRD 9: per-account rate limits).
 */
export async function claim(db: Db, workerId: string, now = new Date()): Promise<Job | null> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const staleBefore = sql`${new Date(now.getTime() - STALE_LOCK_MS).toISOString()}::timestamptz`;
  const result = await db.execute(sql`
    update jobs set locked_at = ${at}, locked_by = ${workerId}, attempts = attempts + 1
    where id = (
      select j.id from jobs j
      where j.done_at is null and j.failed_at is null and j.run_at <= ${at}
        and (j.locked_at is null or j.locked_at < ${staleBefore})
        and not exists (
          select 1 from jobs r
          where r.id <> j.id and r.done_at is null and r.failed_at is null
            and r.locked_at >= ${staleBefore}
            and r.payload->>'accountId' is not null
            and r.payload->>'accountId' = j.payload->>'accountId'
        )
      order by j.priority, j.run_at
      limit 1
      for update skip locked
    )
    returning id
  `);
  const id = (result as unknown as { rows: { id: string }[] }).rows?.[0]?.id ?? (result as unknown as { id: string }[])[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return job ?? null;
}

export async function complete(db: Db, job: Job, now = new Date()) {
  await db.update(jobs).set({ doneAt: now, lockedAt: null, lastError: null }).where(eq(jobs.id, job.id));
}

/** Backoff of 30 s, 2 min, 8 min: three tries over about ten minutes (PRD PB-08). */
export function retryDelayMs(attempt: number) {
  return 30_000 * 4 ** Math.max(0, attempt - 1);
}

export async function fail(db: Db, job: Job, error: unknown, now = new Date()) {
  const message = error instanceof Error ? error.message : String(error);
  const final = error instanceof PermanentError || job.attempts >= job.maxAttempts;
  await db
    .update(jobs)
    .set(
      final
        ? { failedAt: now, lockedAt: null, lastError: message }
        : { lockedAt: null, lastError: message, runAt: new Date(now.getTime() + retryDelayMs(job.attempts)) },
    )
    .where(eq(jobs.id, job.id));
  return final;
}

/** Finished jobs are kept for two weeks for debugging, then removed. */
export async function prune(db: Db, now = new Date()) {
  const before = new Date(now.getTime() - 14 * 864e5);
  await db.delete(jobs).where(or(lt(jobs.doneAt, before), lt(jobs.failedAt, before)));
}

/** Jobs not yet finished for an account, for "Import queued" and progress states. */
export async function pendingFor(db: Db, accountId: string) {
  return db
    .select({ kind: jobs.kind, lockedAt: jobs.lockedAt })
    .from(jobs)
    .where(and(isNull(jobs.doneAt), isNull(jobs.failedAt), sql`${jobs.payload}->>'accountId' = ${accountId}`));
}
