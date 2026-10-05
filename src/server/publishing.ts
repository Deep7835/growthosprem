import "server-only";
import { and, eq } from "drizzle-orm";
import { getSystemDb, withOrg, type Tx } from "@/db";
import { contentItems, placements, posts, socialAccounts } from "@/db/schema";
import { enqueue, PRIORITY } from "@/jobs/queue";
import { zonedToUtc } from "@/lib/analytics/time";
import { getGraph } from "@/lib/meta";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import { checkReadiness, fullCaption, type Issue } from "@/lib/publishing/rules";
import { canPublish, loadBundle, readinessInput, type Bundle } from "@/publishing/bundle";
import { mediaReachable } from "@/publishing/media-url";
import { formatFor, PUBLISH_JOB, syncItemState } from "@/publishing/run";
import { logActivity } from "./activity";
import { returnToReviewIfApproved } from "./approval";
import type { SpaceContext } from "./tenancy";

export type ScheduleMode = "now" | "autopost" | "manual";

const reachable = () => mediaReachable(getGraph()?.fake ?? true);

async function bundleIn(ctx: SpaceContext, tx: Tx, contentItemId: string) {
  const b = await loadBundle(tx, contentItemId);
  if (!b || b.space.id !== ctx.space.id) throw new Error("That post isn’t in this space.");
  return b;
}

const actor = (ctx: SpaceContext) => ({ kind: "user" as const, userId: ctx.user.id, name: ctx.user.name });

/** What the content panel shows about publishing, including the live readiness check. */
export async function getPublishView(ctx: SpaceContext, contentItemId: string) {
  return withOrg(ctx.org.id, async (tx) => {
    const b = await loadBundle(tx, contentItemId);
    if (!b || b.space.id !== ctx.space.id) return null;
    const now = new Date(ctx.requestTime);
    // The full check for posting through the API; time only matters once someone picks one.
    const issues = checkReadiness(readinessInput(b, { mode: "now", when: null, now, mediaReachable: reachable() }));
    const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id));
    const dueSoon = b.item.autopost && b.item.scheduledAt !== null && b.item.scheduledAt.getTime() <= now.getTime() + 60_000;
    return {
      /** Publishing is under way or about to start: the panel refreshes itself. */
      live: b.placements.some((p) => p.state === "publishing" || (p.state === "scheduled" && dueSoon)),
      autopost: b.item.autopost,
      scheduledAt: b.item.scheduledAt?.toISOString() ?? null,
      publishState: b.item.publishState,
      caption: fullCaption(b.item.caption, b.item.hashtags),
      issues,
      placements: b.placements.map((p) => ({
        id: p.id,
        kind: p.kind as PlacementKind,
        state: p.state,
        handle: p.account?.handle ?? null,
        accountLive: p.account ? canPublish(p.account) : false,
        permalink: p.permalink,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        publishedManually: p.publishedManually,
        error: p.error,
        shareToFeed: p.options.shareToFeed ?? true,
      })),
      connectedPlatforms: [...new Set(accounts.filter(canPublish).map((a) => a.platform))],
      mediaIds: b.media.map((m) => ({ id: m.id, filename: m.filename })),
    };
  });
}

export type PublishView = NonNullable<Awaited<ReturnType<typeof getPublishView>>>;

/** "YYYY-MM-DDTHH:mm" in the space's timezone → UTC. */
function parseLocal(value: string, timeZone: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return zonedToUtc(y, mo, d, h, mi, timeZone);
}

/**
 * PB-03: Post now, Schedule with autopost (published by the queue), or Schedule without
 * (a reminder at that time). Returns the readiness issues instead when it isn't ready (PB-07).
 */
export async function schedulePost(ctx: SpaceContext, contentItemId: string, input: { mode: ScheduleMode; when?: string }): Promise<{ issues: Issue[] }> {
  const now = new Date();
  const when = input.mode === "now" ? now : input.when ? parseLocal(input.when, ctx.space.timezone) : null;
  const autopost = input.mode !== "manual";

  const plan = await withOrg(ctx.org.id, async (tx) => {
    const b = await bundleIn(ctx, tx, contentItemId);
    if (b.placements.some((p) => p.state === "publishing")) throw new Error("This post is publishing right now. Wait a moment.");
    const issues = checkReadiness(readinessInput(b, { mode: input.mode, when, now, mediaReachable: reachable() }));
    if (issues.length) return { issues, jobs: [] };

    const pending = b.placements.filter((p) => p.state !== "published");
    for (const p of pending) {
      await tx
        .update(placements)
        .set({ state: "scheduled", socialAccountId: p.account?.id ?? p.socialAccountId, publishStep: null, containerId: null, error: null, errorRetryable: null, failedAt: null })
        .where(eq(placements.id, p.id));
    }
    await tx.update(contentItems).set({ scheduledAt: when, autopost, updatedAt: now }).where(eq(contentItems.id, b.item.id));
    await syncItemState(tx, b.item.id);
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: b.item.id,
      actor: actor(ctx),
      action: input.mode === "now" ? "posted now" : autopost ? "scheduled with autopost" : "scheduled without autopost",
      field: "schedule",
      before: b.item.scheduledAt?.toISOString() ?? null,
      after: when!.toISOString(),
    });
    const at = when!;
    const jobs = autopost
      ? pending.map((p) => ({
          kind: PUBLISH_JOB.publish,
          payload: { placementId: p.id, scheduledAt: at.toISOString(), ...(p.account ? { accountId: p.account.id } : {}) },
          runAt: at,
          priority: PRIORITY.publish,
          dedupeKey: `publish:${p.id}:${at.getTime()}`,
        }))
      : [
          {
            kind: PUBLISH_JOB.reminder,
            payload: { contentItemId: b.item.id, orgId: ctx.org.id, scheduledAt: at.toISOString() },
            runAt: at,
            priority: PRIORITY.publish,
            dedupeKey: `reminder:${b.item.id}:${at.getTime()}`,
          },
        ];
    return { issues: [], jobs };
  });
  if (plan.jobs.length) await enqueue(await getSystemDb(), plan.jobs);
  return { issues: plan.issues };
}

export async function unschedulePost(ctx: SpaceContext, contentItemId: string) {
  await withOrg(ctx.org.id, async (tx) => {
    const b = await bundleIn(ctx, tx, contentItemId);
    if (b.placements.some((p) => p.state === "publishing")) throw new Error("This post is publishing right now and can’t be unscheduled.");
    await tx
      .update(placements)
      .set({ state: "draft" })
      .where(and(eq(placements.contentItemId, b.item.id), eq(placements.state, "scheduled")));
    await tx.update(contentItems).set({ scheduledAt: null, updatedAt: new Date() }).where(eq(contentItems.id, b.item.id));
    await syncItemState(tx, b.item.id);
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: b.item.id, actor: actor(ctx), action: "unscheduled", field: "schedule" });
    // Queued jobs see the change and skip themselves.
  });
}

async function placementIn(ctx: SpaceContext, tx: Tx, placementId: string): Promise<{ b: Bundle; p: Bundle["placements"][number] }> {
  const [ref] = await tx.select({ contentItemId: placements.contentItemId }).from(placements).where(eq(placements.id, placementId));
  if (!ref) throw new Error("That placement no longer exists.");
  const b = await bundleIn(ctx, tx, ref.contentItemId);
  return { b, p: b.placements.find((x) => x.id === placementId)! };
}

/** PB-09: retry one failed placement now. */
export async function retryPlacement(ctx: SpaceContext, placementId: string): Promise<{ issues: Issue[] }> {
  const now = new Date();
  const plan = await withOrg(ctx.org.id, async (tx) => {
    const { b, p } = await placementIn(ctx, tx, placementId);
    if (p.state !== "failed") throw new Error("Only failed placements can be retried.");
    const issues = checkReadiness(readinessInput(b, { mode: "now", when: null, now, mediaReachable: reachable(), only: p.id }));
    if (issues.length) return { issues, job: null };
    const at = b.item.scheduledAt ?? now;
    await tx
      .update(placements)
      .set({ state: "scheduled", socialAccountId: p.account!.id, publishStep: null, containerId: null, error: null, errorRetryable: null, failedAt: null })
      .where(eq(placements.id, p.id));
    await tx.update(contentItems).set({ autopost: true, scheduledAt: at }).where(eq(contentItems.id, b.item.id));
    await syncItemState(tx, b.item.id);
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: b.item.id, actor: actor(ctx), action: `retried ${PLACEMENTS[p.kind as PlacementKind].label}` });
    return {
      issues: [],
      job: {
        kind: PUBLISH_JOB.publish,
        payload: { placementId: p.id, scheduledAt: at.toISOString(), accountId: p.account!.id },
        priority: PRIORITY.publish,
        dedupeKey: `publish:${p.id}:retry:${now.getTime()}`,
      },
    };
  });
  if (plan.job) await enqueue(await getSystemDb(), plan.job);
  return { issues: plan.issues };
}

/** PB-12: someone posted it themselves. The link is kept for "View post". */
export async function markPostedManually(ctx: SpaceContext, placementId: string, link: string) {
  const url = link.trim();
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw new Error("Paste the post’s full link, starting with https://");
  await withOrg(ctx.org.id, async (tx) => {
    const { b, p } = await placementIn(ctx, tx, placementId);
    if (p.state === "published" || p.state === "publishing") throw new Error("This placement is already published.");
    const now = new Date();
    await tx
      .update(placements)
      .set({ state: "published", publishedManually: true, permalink: url || null, publishedAt: now, error: null, errorRetryable: null, failedAt: null })
      .where(eq(placements.id, p.id));
    if (p.account) {
      // Counts in analytics; the hourly sync swaps in the real post when the link matches.
      await tx
        .insert(posts)
        .values({
          orgId: ctx.org.id,
          spaceId: ctx.space.id,
          socialAccountId: p.account.id,
          externalId: `manual:${p.id}`,
          publishedAt: now,
          format: formatFor(p.kind as PlacementKind, b.media.length),
          title: b.item.title,
          caption: fullCaption(p.captionOverride ?? b.item.caption, b.item.hashtags),
          permalink: url || null,
          contentItemId: b.item.id,
          pillar: b.item.pillar,
        })
        .onConflictDoNothing();
    }
    await syncItemState(tx, b.item.id);
    await logActivity(tx, {
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      contentItemId: b.item.id,
      actor: actor(ctx),
      action: `marked ${PLACEMENTS[p.kind as PlacementKind].label} as posted manually`,
      after: url || null,
    });
  });
}

function assertEditable(b: Bundle) {
  if (b.item.publishState === "scheduled" || b.placements.some((p) => p.state === "scheduled" || p.state === "publishing")) {
    throw new Error("Unschedule the post to change its platforms.");
  }
}

export async function addPlacement(ctx: SpaceContext, contentItemId: string, kind: PlacementKind) {
  if (!(kind in PLACEMENTS)) throw new Error("Unknown placement.");
  await withOrg(ctx.org.id, async (tx) => {
    const b = await bundleIn(ctx, tx, contentItemId);
    assertEditable(b);
    if (b.placements.some((p) => p.kind === kind)) return;
    const platform = PLACEMENTS[kind].platform;
    const accounts = await tx.select().from(socialAccounts).where(and(eq(socialAccounts.spaceId, ctx.space.id), eq(socialAccounts.platform, platform)));
    const account = accounts.find(canPublish) ?? accounts.find((a) => a.status !== "disconnected") ?? null;
    // PB-05: platform defaults are applied when the placement is added.
    await tx.insert(placements).values({
      orgId: ctx.org.id,
      contentItemId: b.item.id,
      kind,
      socialAccountId: account?.id ?? null,
      options: kind === "ig_reel" ? { shareToFeed: true } : {},
    });
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: b.item.id, actor: actor(ctx), action: `added ${PLACEMENTS[kind].label}`, field: "placements" });
    await returnToReviewIfApproved(tx, b.item);
  });
}

export async function removePlacement(ctx: SpaceContext, placementId: string) {
  await withOrg(ctx.org.id, async (tx) => {
    const { b, p } = await placementIn(ctx, tx, placementId);
    assertEditable(b);
    if (p.state === "published") throw new Error("A published placement can’t be removed.");
    await tx.delete(placements).where(eq(placements.id, p.id));
    await syncItemState(tx, b.item.id);
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: b.item.id, actor: actor(ctx), action: `removed ${PLACEMENTS[p.kind as PlacementKind].label}`, field: "placements" });
    await returnToReviewIfApproved(tx, b.item);
  });
}

export async function setShareToFeed(ctx: SpaceContext, placementId: string, value: boolean) {
  await withOrg(ctx.org.id, async (tx) => {
    const { p } = await placementIn(ctx, tx, placementId);
    await tx.update(placements).set({ options: { ...p.options, shareToFeed: value } }).where(eq(placements.id, p.id));
  });
}
