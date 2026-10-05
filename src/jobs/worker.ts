// Runs queued jobs. In development it runs inside the Next.js server (src/instrumentation.ts);
// in production it runs as its own process: npm run worker.
import { randomUUID } from "node:crypto";
import type { Db } from "@/db/core";
import type { Graph } from "@/lib/meta/graph";
import { JOB, checkTokenHealth, scheduleRecurring, syncAccount, syncGaveUp } from "./meta-sync";
import { claim, complete, fail, type Job } from "./queue";
import { reconcileScheduled } from "@/publishing/reconcile";
import { PUBLISH_JOB, failureFollowup, publishPlacement, sendReminder } from "@/publishing/run";
import { NOTIFY_JOB, notificationChores, sendDigest } from "@/notifications/worker";
import { purgeDeletedSpaces } from "@/spaces/purge";

export interface WorkerDeps {
  getDb: () => Promise<Db>;
  getGraph: () => Graph | null;
  log?: (message: string) => void;
}

/** Runs one job; throws if it fails or no handler exists for its kind. */
export async function runJob(job: Job, db: Db, graph: Graph | null): Promise<void> {
  const payload = job.payload as Record<string, string>;
  switch (job.kind) {
    case PUBLISH_JOB.reminder:
      return sendReminder({ db }, payload as { contentItemId: string; orgId: string; scheduledAt: string });
    case PUBLISH_JOB.followup:
      return failureFollowup({ db }, payload as { placementId: string; failedAt: string });
    case NOTIFY_JOB.digest:
      return sendDigest(db, payload as { orgId: string; userId: string; date: string });
  }
  if (!graph) throw new Error("Instagram and Facebook are not set up (META_APP_ID).");
  if (job.kind === PUBLISH_JOB.publish) {
    await publishPlacement({ db, graph }, payload as { placementId: string; scheduledAt: string }, { n: job.attempts, max: job.maxAttempts });
    return;
  }
  const { accountId } = payload;
  if (!accountId) throw new Error(`Job ${job.kind} has no accountId.`);
  switch (job.kind) {
    case JOB.import:
      await syncAccount({ db, graph }, accountId, "import");
      return;
    case JOB.sync:
      await syncAccount({ db, graph }, accountId, "sync");
      return;
    case JOB.health:
      await checkTokenHealth({ db, graph }, accountId);
      return;
    default:
      throw new Error(`No handler for job kind ${job.kind}.`);
  }
}

async function onGiveUp(job: Job, db: Db) {
  const { accountId } = job.payload as { accountId?: string };
  if (!accountId) return;
  if (job.kind === JOB.import) await syncGaveUp(db, accountId, "import");
  if (job.kind === JOB.sync) await syncGaveUp(db, accountId, "sync");
}

/** Processes jobs until no due job is left. Used by the loop below and by tests. */
export async function drain(deps: WorkerDeps, workerId = "drain", limit = 1000) {
  const db = await deps.getDb();
  let ran = 0;
  for (; ran < limit; ran++) {
    const job = await claim(db, workerId);
    if (!job) break;
    try {
      await runJob(job, db, deps.getGraph());
      await complete(db, job);
    } catch (error) {
      const final = await fail(db, job, error);
      deps.log?.(`[jobs] ${job.kind} failed${final ? " for good" : ", will retry"}: ${error instanceof Error ? error.message : error}`);
      if (final) await onGiveUp(job, db).catch(() => {});
    }
  }
  return ran;
}

export function startWorker(deps: WorkerDeps, opts: { pollMs?: number; scheduleMs?: number } = {}) {
  const id = `worker-${randomUUID().slice(0, 8)}`;
  const pollMs = opts.pollMs ?? 1000;
  const scheduleMs = opts.scheduleMs ?? 60_000;
  let stopped = false;
  let lastSchedule = 0;

  const loop = (async () => {
    while (!stopped) {
      try {
        const db = await deps.getDb();
        if (Date.now() - lastSchedule >= scheduleMs) {
          lastSchedule = Date.now();
          if (deps.getGraph()) await scheduleRecurring(db);
          await reconcileScheduled(db);
          await notificationChores(db);
          await purgeDeletedSpaces(db);
        }
        const ran = await drain(deps, id, 20);
        if (ran > 0) continue;
      } catch (error) {
        deps.log?.(`[jobs] worker error: ${error instanceof Error ? error.message : error}`);
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  })();

  deps.log?.(`[jobs] ${id} started`);
  return {
    id,
    async stop() {
      stopped = true;
      await loop;
    },
  };
}
