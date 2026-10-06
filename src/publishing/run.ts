// Publishing jobs (PB-08 to PB-11): post one placement at its time, remind people about
// manual posts, and email about failures still open after 30 minutes.
import { eq } from "drizzle-orm";
import { withOrg, type Db, type Tx } from "@/db/core";
import { activityLog, contentItems, placements, posts } from "@/db/schema";
import { needsReconnect } from "@/jobs/meta-sync";
import { enqueue, PRIORITY } from "@/jobs/queue";
import type { Format } from "@/lib/analytics/audit";
import { openToken } from "@/lib/crypto";
import { escapeHtml as escape, sendEmail } from "@/lib/email";
import { GraphError, type Graph } from "@/lib/meta/graph";
import { titleFromCaption } from "@/lib/meta/health";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import { checkReadiness, fullCaption, issuesFor, itemPublishState } from "@/lib/publishing/rules";
import { loadBundle, readinessInput, type Bundle } from "./bundle";
import { publicBase, publicMediaUrl, mediaReachable } from "./media-url";
import { audience, emailsFor, notify } from "./notify";
import { channelsForPeople } from "@/notifications/deliver";

export const PUBLISH_JOB = { publish: "publish.placement", reminder: "publish.reminder", followup: "publish.failure_email" } as const;

const FOLLOW_UP_MS = 30 * 60_000;

export interface PublishDeps {
  db: Db;
  graph: Graph;
  now?: () => Date;
}

type Placement = Bundle["placements"][number];

export function formatFor(kind: PlacementKind, mediaCount: number): Format {
  if (kind.endsWith("reel")) return "reel";
  if (kind.endsWith("story")) return "story";
  if (kind === "ig_carousel" || mediaCount > 1) return "carousel";
  return "post";
}

async function log(tx: Tx, b: Bundle, action: string, after?: unknown) {
  await tx.insert(activityLog).values({
    orgId: b.item.orgId,
    spaceId: b.space.id,
    targetType: "content_item",
    targetId: b.item.id,
    actorKind: "system",
    actorLabel: "Plotline",
    action,
    after: after ?? null,
  });
}

/** The post's publish state follows its placements (PB-09). */
export async function syncItemState(tx: Tx, contentItemId: string) {
  const rows = await tx.select({ state: placements.state }).from(placements).where(eq(placements.contentItemId, contentItemId));
  const state = itemPublishState(rows.map((r) => r.state));
  await tx.update(contentItems).set({ publishState: state }).where(eq(contentItems.id, contentItemId));
  return state;
}

async function markFailed(deps: PublishDeps, b: Bundle, p: Placement, reason: string, retryable: boolean) {
  const now = (deps.now ?? (() => new Date()))();
  const name = PLACEMENTS[p.kind as PlacementKind].label;
  await withOrg(deps.db, b.item.orgId, async (tx) => {
    await tx
      .update(placements)
      .set({ state: "failed", error: reason, errorRetryable: retryable, failedAt: now })
      .where(eq(placements.id, p.id));
    await syncItemState(tx, b.item.id);
    await log(tx, b, `publish failed on ${name}`, { reason });
    await notify(tx, b, await audience(tx, b, { managers: true }), {
      kind: "publish_failed",
      title: `${name} failed: ${b.item.title}`,
      body: reason,
      // PB-10 emails after 30 minutes if it's still failed, not straight away.
      noEmail: true,
    });
  });
  // PB-10: an email if it's still unresolved after 30 minutes.
  await enqueue(deps.db, {
    kind: PUBLISH_JOB.followup,
    payload: { placementId: p.id, failedAt: now.toISOString() },
    runAt: new Date(now.getTime() + FOLLOW_UP_MS),
    priority: PRIORITY.health,
    dedupeKey: `followup:${p.id}:${now.getTime()}`,
  });
}

/** Publishes one placement. Returns what happened; throws only for errors worth retrying. */
export async function publishPlacement(
  deps: PublishDeps,
  payload: { placementId: string; scheduledAt: string },
  attempt: { n: number; max: number } = { n: 1, max: 3 },
): Promise<"published" | "failed" | "skipped"> {
  const now = (deps.now ?? (() => new Date()))();
  const [ref] = await deps.db.select({ orgId: placements.orgId, contentItemId: placements.contentItemId }).from(placements).where(eq(placements.id, payload.placementId));
  if (!ref) return "skipped";
  const b = await withOrg(deps.db, ref.orgId, (tx) => loadBundle(tx, ref.contentItemId));
  const p = b?.placements.find((x) => x.id === payload.placementId);
  if (!b || !p) return "skipped";

  // Unscheduled, rescheduled, switched to manual or already done since this job was queued.
  if (p.state !== "scheduled" && p.state !== "publishing") return "skipped";
  if (b.item.scheduledAt?.toISOString() !== payload.scheduledAt || !b.item.autopost) return "skipped";

  if (p.publishStep === "publish_sent") {
    await markFailed(
      deps,
      b,
      p,
      "We couldn’t confirm whether this posted. Check the account: if it’s there, mark it as posted; if not, retry.",
      true,
    );
    return "failed";
  }

  // PB-06: the readiness check runs again just before publishing.
  const issues = issuesFor(p.id, checkReadiness(readinessInput(b, { mode: "now", when: null, now, mediaReachable: mediaReachable(deps.graph.fake), only: p.id })));
  if (issues.length) {
    await markFailed(deps, b, p, issues.map((i) => i.message).join(" "), true);
    return "failed";
  }
  const account = p.account!;

  await withOrg(deps.db, b.item.orgId, async (tx) => {
    await tx.update(placements).set({ state: "publishing", socialAccountId: account.id, error: null }).where(eq(placements.id, p.id));
    await syncItemState(tx, b.item.id);
  });

  const caption = fullCaption(p.captionOverride ?? b.item.caption, b.item.hashtags);
  try {
    const result = await deps.graph.publish(
      {
        kind: p.kind as PlacementKind,
        targetId: account.externalId!,
        token: openToken(account.accessTokenEnc!),
        caption,
        firstComment: b.item.firstComment,
        shareToFeed: p.options.shareToFeed ?? true,
        media: b.media.map((m) => ({ type: m.type === "video" ? "video" : "image", url: publicMediaUrl(m.id, now.getTime()) })),
        containerId: p.containerId,
      },
      (step, containerId) =>
        withOrg(deps.db, b.item.orgId, (tx) =>
          tx
            .update(placements)
            .set({ publishStep: step, ...(containerId ? { containerId } : {}) })
            .where(eq(placements.id, p.id)),
        ).then(() => undefined),
    );

    const name = PLACEMENTS[p.kind as PlacementKind].label;
    await withOrg(deps.db, b.item.orgId, async (tx) => {
      await tx
        .update(placements)
        .set({ state: "published", externalId: result.externalId, permalink: result.permalink, publishedAt: now, error: null, errorRetryable: null, failedAt: null })
        .where(eq(placements.id, p.id));
      // PB-11: the post joins analytics; the hourly sync collects its numbers from now on.
      await tx
        .insert(posts)
        .values({
          orgId: b.item.orgId,
          spaceId: b.space.id,
          socialAccountId: account.id,
          externalId: result.externalId,
          publishedAt: now,
          format: formatFor(p.kind as PlacementKind, b.media.length),
          title: b.item.title || titleFromCaption(caption, name),
          caption,
          permalink: result.permalink,
          contentItemId: b.item.id,
          pillar: b.item.pillar,
        })
        .onConflictDoNothing();
      const state = await syncItemState(tx, b.item.id);
      await log(tx, b, `published to ${name}`, { permalink: result.permalink, firstCommentFailed: result.firstCommentFailed ?? false });
      if (state === "published" || state === "partially_published") {
        await notify(tx, b, await audience(tx, b, { managers: false }), {
          kind: "published",
          title: `${state === "published" ? "Published" : "Partly published"}: ${b.item.title}`,
          body: result.firstCommentFailed ? "The first comment couldn’t be added. Add it on the post." : "",
        });
      }
    });
    return "published";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof GraphError && error.needsReconnect) {
      await needsReconnect(deps.db, account, message);
      await markFailed(deps, b, p, `${account.handle} needs reconnecting (${message}). Reconnect it, then retry.`, true);
      return "failed";
    }
    const temporary = !(error instanceof GraphError) || error.temporary;
    if (temporary && attempt.n < attempt.max) {
      await withOrg(deps.db, b.item.orgId, (tx) => tx.update(placements).set({ error: `Retrying: ${message}`, errorRetryable: true }).where(eq(placements.id, p.id)));
      throw error;
    }
    await markFailed(deps, b, p, temporary ? `${message} (tried ${attempt.n} times)` : message, temporary);
    return "failed";
  }
}

/** PB-03: with autopost off, the people on the post get a reminder at the scheduled time. */
export async function sendReminder(deps: Pick<PublishDeps, "db">, payload: { contentItemId: string; orgId: string; scheduledAt: string }) {
  await withOrg(deps.db, payload.orgId, async (tx) => {
    const b = await loadBundle(tx, payload.contentItemId);
    if (!b || b.item.autopost || b.item.publishState !== "scheduled" || b.item.scheduledAt?.toISOString() !== payload.scheduledAt) return;
    await notify(tx, b, await audience(tx, b, { managers: false }), {
      kind: "publish_reminder",
      title: `Time to post: ${b.item.title}`,
      body: "Copy the caption and download the media from the post, then mark it as posted.",
    });
    await log(tx, b, "reminder sent");
  });
}

/** PB-10: still failed 30 minutes later, so email the same people. */
export async function failureFollowup(deps: Pick<PublishDeps, "db">, payload: { placementId: string; failedAt: string }) {
  const [ref] = await deps.db.select().from(placements).where(eq(placements.id, payload.placementId));
  if (!ref || ref.state !== "failed" || ref.failedAt?.toISOString() !== payload.failedAt) return;
  const recipients = await withOrg(deps.db, ref.orgId, async (tx) => {
    const b = await loadBundle(tx, ref.contentItemId);
    if (!b) return null;
    const ids = await audience(tx, b, { managers: true });
    const channels = await channelsForPeople(tx, ids, b.space.id, "action_required");
    return { b, people: await emailsFor(tx, ids.filter((id) => channels.get(id)?.email)) };
  });
  if (!recipients) return;
  const { b, people } = recipients;
  const name = PLACEMENTS[ref.kind as PlacementKind].label;
  const link = `${publicBase()}${b.itemHref}`;
  for (const person of people) {
    await sendEmail({
      to: person.email,
      subject: `Still not posted: ${b.item.title} (${name})`,
      text: `Hi ${person.name},\n\n“${b.item.title}” didn’t post to ${name} in ${b.space.name}, and it hasn’t been fixed yet.\n\nReason: ${ref.error}\n\nOpen it to retry or mark it as posted: ${link}\n`,
      html: `<p>Hi ${escape(person.name)},</p><p>“${escape(b.item.title)}” didn’t post to ${name} in ${escape(b.space.name)}, and it hasn’t been fixed yet.</p><p><strong>Reason:</strong> ${escape(ref.error ?? "")}</p><p><a href="${link}">Open the post</a> to retry or mark it as posted.</p>`,
      idempotencyKey: `publish-failed:${ref.id}:${payload.failedAt}:${person.email}`,
    });
  }
}


