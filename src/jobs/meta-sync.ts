// Instagram and Facebook jobs (PRD 9): the 90-day history import (OB-07), post metrics at
// 1 h / 24 h / 3 / 7 / 30 days, the daily follower snapshot and the daily token check.
import { and, eq, inArray, isNotNull, like, max } from "drizzle-orm";
import { withOrg, type Db, type Tx } from "@/db/core";
import { accountMetricsDaily, activityLog, organizations, postMetrics, posts, socialAccounts, spaces } from "@/db/schema";
import { isoDate, zonedParts } from "@/lib/analytics/time";
import { openToken } from "@/lib/crypto";
import { snapshotDue } from "@/lib/meta/checkpoints";
import { GraphError, type Graph } from "@/lib/meta/graph";
import { titleFromCaption, tokenStatus } from "@/lib/meta/health";
import { PLATFORM_NAMES } from "@/lib/placements";
import { deliver, spaceManagers } from "@/notifications/deliver";
import { enqueue, PermanentError, PRIORITY, prune } from "./queue";

export const JOB = { import: "meta.import", sync: "meta.sync", health: "meta.token_health" } as const;

const DAY = 864e5;
const FORMAT_NAMES = { reel: "Reel", carousel: "Carousel", post: "Post", story: "Story" } as const;

/** Instagram and Facebook links differ in trailing slashes, query strings and www. */
export function sameLink(a: string, b: string) {
  const norm = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  return norm(a) === norm(b);
}

export interface SyncDeps {
  db: Db;
  graph: Graph;
  now?: () => Date;
}

type Account = typeof socialAccounts.$inferSelect;

async function load(db: Db, accountId: string) {
  const [row] = await db
    .select({ account: socialAccounts, timezone: spaces.timezone })
    .from(socialAccounts)
    .innerJoin(spaces, eq(spaces.id, socialAccounts.spaceId))
    .where(eq(socialAccounts.id, accountId));
  return row ?? null;
}

async function logAccount(tx: Tx, account: Account, action: string, after?: unknown) {
  await tx.insert(activityLog).values({
    orgId: account.orgId,
    spaceId: account.spaceId,
    targetType: "social_account",
    targetId: account.id,
    actorKind: "system",
    actorLabel: "Growth OS",
    action,
    after: after ?? null,
  });
}

/** Tells the space's Managers, Owners and Admins about an account problem (NT-02: social account). */
async function notifyAccount(tx: Tx, account: Account, n: { kind: "account_reconnect" | "account_expiring"; title: string; body: string; key: string }) {
  const [where] = await tx
    .select({ org: organizations.slug, space: spaces.slug, spaceName: spaces.name })
    .from(spaces)
    .innerJoin(organizations, eq(organizations.id, spaces.orgId))
    .where(eq(spaces.id, account.spaceId));
  await deliver(tx, await spaceManagers(tx, account.spaceId), {
    orgId: account.orgId,
    spaceId: account.spaceId,
    kind: n.kind,
    title: n.title,
    body: where ? `${where.spaceName} · ${n.body}` : n.body,
    href: where ? `/o/${where.org}/s/${where.space}/settings/accounts` : null,
    key: n.key,
  });
}

const platformName = (a: Account) => PLATFORM_NAMES[a.platform];

/** The account can no longer be read: only reconnecting fixes it. Retrying would not help. */
export async function needsReconnect(db: Db, account: Account, reason: string) {
  await withOrg(db, account.orgId, async (tx) => {
    await tx
      .update(socialAccounts)
      .set({ status: "reconnect_needed", statusReason: reason, syncState: null, syncProgress: null })
      .where(eq(socialAccounts.id, account.id));
    if (account.status !== "reconnect_needed") {
      await logAccount(tx, account, "reconnect_needed", { reason });
      await notifyAccount(tx, account, {
        kind: "account_reconnect",
        title: `Reconnect ${platformName(account)} ${account.handle}`,
        body: `${reason} Scheduled posts to it won’t go out until it’s reconnected.`,
        key: `account_reconnect:${account.id}:${Date.now()}`,
      });
    }
  });
}

/**
 * Imports or refreshes an account's posts and numbers. "import" reads the last 90 days;
 * "sync" reads the last 31, and only asks Meta for posts that passed a checkpoint.
 */
export async function syncAccount(deps: SyncDeps, accountId: string, mode: "import" | "sync") {
  const now = (deps.now ?? (() => new Date()))();
  const row = await load(deps.db, accountId);
  if (!row) return { skipped: "missing" as const };
  const { account, timezone } = row;
  if (!account.accessTokenEnc || !account.externalId || account.status === "disconnected" || account.status === "reconnect_needed") {
    return { skipped: account.status };
  }
  const token = openToken(account.accessTokenEnc);
  const platform = account.platform as "instagram" | "facebook";
  const scoped = <T>(fn: (tx: Tx) => Promise<T>) => withOrg(deps.db, account.orgId, fn);
  const progress = (done: number, total: number) =>
    scoped((tx) => tx.update(socialAccounts).set({ syncProgress: { done, total } }).where(eq(socialAccounts.id, account.id)));

  await scoped((tx) =>
    tx
      .update(socialAccounts)
      .set({ syncState: mode === "import" ? "importing" : "syncing", syncProgress: { done: 0, total: 0 } })
      .where(eq(socialAccounts.id, account.id)),
  );

  try {
    const since = new Date(now.getTime() - (mode === "import" ? 90 : 31) * DAY);
    const profile = await deps.graph.profile(platform, account.externalId, token);
    const list = await deps.graph.listPosts(platform, account.externalId, token, since);

    const known = await scoped((tx) =>
      tx
        .select({ id: posts.id, externalId: posts.externalId, last: max(postMetrics.takenAt) })
        .from(posts)
        .leftJoin(postMetrics, eq(postMetrics.postId, posts.id))
        .where(eq(posts.socialAccountId, account.id))
        .groupBy(posts.id),
    );
    const byExternal = new Map(known.map((k) => [k.externalId, k]));
    const due = list.filter((p) => snapshotDue(p.publishedAt, byExternal.get(p.externalId)?.last ?? null, now));
    await progress(0, due.length);

    // Posts marked as posted manually carry a link; when the real post shows up, it takes over that row.
    const manual = await scoped((tx) =>
      tx
        .select({ id: posts.id, permalink: posts.permalink })
        .from(posts)
        .where(and(eq(posts.socialAccountId, account.id), like(posts.externalId, "manual:%"))),
    );
    for (const p of list) {
      const match = p.permalink && manual.find((m) => m.permalink && sameLink(m.permalink, p.permalink!));
      if (match && !byExternal.has(p.externalId)) {
        await scoped((tx) => tx.update(posts).set({ externalId: p.externalId, publishedAt: p.publishedAt }).where(eq(posts.id, match.id)));
      }
    }

    let done = 0;
    for (const p of due) {
      const numbers = await deps.graph.postNumbers(platform, p, token);
      await scoped(async (tx) => {
        const [post] = await tx
          .insert(posts)
          .values({
            orgId: account.orgId,
            spaceId: account.spaceId,
            socialAccountId: account.id,
            externalId: p.externalId,
            publishedAt: p.publishedAt,
            format: p.format,
            title: titleFromCaption(p.caption, `${FORMAT_NAMES[p.format]} on ${isoDate(zonedParts(p.publishedAt, timezone))}`),
            caption: p.caption,
            permalink: p.permalink,
          })
          .onConflictDoUpdate({
            target: [posts.socialAccountId, posts.externalId],
            set: { caption: p.caption, permalink: p.permalink, format: p.format },
          })
          .returning({ id: posts.id });
        await tx.insert(postMetrics).values({ orgId: account.orgId, postId: post.id, takenAt: now, ...numbers });
      });
      done++;
      if (done % 5 === 0 || done === due.length) await progress(done, due.length);
    }

    const today = isoDate(zonedParts(now, timezone));
    const history = mode === "import" ? await deps.graph.followerHistory(platform, account.externalId, token, since).catch(() => []) : [];
    await scoped(async (tx) => {
      const days = new Map(history.map((h) => [isoDate(zonedParts(new Date(h.at.getTime() - 1), timezone)), h.followers]));
      if (profile.followers !== null) days.set(today, profile.followers);
      for (const [day, followers] of days) {
        await tx
          .insert(accountMetricsDaily)
          .values({ orgId: account.orgId, socialAccountId: account.id, day, followers })
          .onConflictDoUpdate({ target: [accountMetricsDaily.socialAccountId, accountMetricsDaily.day], set: { followers } });
      }
      await tx
        .update(socialAccounts)
        .set({
          handle: profile.handle,
          name: profile.name,
          lastSyncedAt: now,
          syncState: null,
          syncProgress: null,
          status: tokenStatus(account.tokenExpiresAt, now),
        })
        .where(eq(socialAccounts.id, account.id));
      await tx.update(spaces).set({ metricsRefreshedAt: now }).where(eq(spaces.id, account.spaceId));
      if (mode === "import") await logAccount(tx, account, "history_imported", { posts: list.length, days: 90 });
    });
    return { posts: list.length, snapshots: due.length };
  } catch (error) {
    if (error instanceof GraphError && error.needsReconnect) {
      await needsReconnect(deps.db, account, error.message);
      throw new PermanentError(error.message);
    }
    if (error instanceof GraphError && !error.temporary) throw new PermanentError(error.message);
    throw error;
  }
}

/** Called once the queue gives up on an import or sync. */
export async function syncGaveUp(db: Db, accountId: string, mode: "import" | "sync") {
  const row = await load(db, accountId);
  if (!row || row.account.status === "reconnect_needed") return;
  await withOrg(db, row.account.orgId, (tx) =>
    tx
      .update(socialAccounts)
      .set({ syncState: mode === "import" ? "import_failed" : null, syncProgress: null })
      .where(eq(socialAccounts.id, accountId)),
  );
}

/** Daily: is the connection still accepted, and when does it run out (warn 7 days before)? */
export async function checkTokenHealth(deps: SyncDeps, accountId: string) {
  const now = (deps.now ?? (() => new Date()))();
  const row = await load(deps.db, accountId);
  const sealed = row?.account.accessTokenEnc;
  if (!row || !sealed || row.account.status === "disconnected") return;
  const { account } = row;
  let info;
  try {
    info = await deps.graph.inspectToken(openToken(sealed));
  } catch (error) {
    if (error instanceof GraphError && error.needsReconnect) return needsReconnect(deps.db, account, error.message);
    throw error;
  }
  if (!info.valid) return needsReconnect(deps.db, account, "Meta no longer accepts this connection.");
  const status = tokenStatus(info.expiresAt, now);
  if (status === "reconnect_needed") return needsReconnect(deps.db, account, "Access to this account has expired.");
  await withOrg(deps.db, account.orgId, async (tx) => {
    await tx.update(socialAccounts).set({ status, tokenExpiresAt: info.expiresAt, statusReason: null }).where(eq(socialAccounts.id, account.id));
    if (status === "expiring" && account.status !== "expiring") {
      await logAccount(tx, account, "token_expiring", { expiresAt: info.expiresAt });
      const days = info.expiresAt ? Math.max(1, Math.ceil((info.expiresAt.getTime() - now.getTime()) / 864e5)) : null;
      await notifyAccount(tx, account, {
        kind: "account_expiring",
        title: `${platformName(account)} ${account.handle} needs reconnecting${days ? ` within ${days} day${days === 1 ? "" : "s"}` : " soon"}`,
        body: "Reconnect it to keep posting and syncing.",
        key: `account_expiring:${account.id}:${info.expiresAt?.getTime() ?? 0}`,
      });
    }
  });
}

/** Run every minute by the worker: hourly metric syncs and daily token checks for live accounts. */
export async function scheduleRecurring(db: Db, now = new Date()) {
  const accounts = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(and(isNotNull(socialAccounts.accessTokenEnc), inArray(socialAccounts.status, ["active", "expiring"])));
  const hour = now.toISOString().slice(0, 13);
  const day = hour.slice(0, 10);
  await enqueue(
    db,
    accounts.flatMap((a) => [
      { kind: JOB.sync, payload: { accountId: a.id }, priority: PRIORITY.sync, dedupeKey: `sync:${a.id}:${hour}` },
      { kind: JOB.health, payload: { accountId: a.id }, priority: PRIORITY.health, dedupeKey: `health:${a.id}:${day}` },
    ]),
  );
  await prune(db, now);
}

/** "Sync now" and the analytics Refresh button: at most once per account every 15 minutes. */
export async function enqueueManualSync(db: Db, accountIds: string[], now = new Date()) {
  const bucket = Math.floor(now.getTime() / (15 * 60 * 1000));
  return enqueue(
    db,
    accountIds.map((id) => ({ kind: JOB.sync, payload: { accountId: id }, priority: PRIORITY.manual, dedupeKey: `sync:${id}:manual:${bucket}` })),
  );
}

export async function enqueueImport(db: Db, accountId: string, now = new Date()) {
  // A reconnect imports again (the import is idempotent), but not twice within a minute.
  return enqueue(db, {
    kind: JOB.import,
    payload: { accountId },
    priority: PRIORITY.manual,
    dedupeKey: `import:${accountId}:${Math.floor(now.getTime() / 60000)}`,
  });
}
