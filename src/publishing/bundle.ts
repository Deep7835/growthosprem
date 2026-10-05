// Everything the readiness check and the publisher need about one post, loaded in one
// tenant-scoped transaction. Shared by the web server and the job worker.
import { and, desc, eq } from "drizzle-orm";
import type { Tx } from "@/db/core";
import { mediaForContent } from "@/db/media";
import { approvals, contentItems, organizations, placements, socialAccounts, spaces, statuses } from "@/db/schema";
import { contentVersionHash } from "@/lib/content-version";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import type { ReadinessInput } from "@/lib/publishing/rules";

type Account = typeof socialAccounts.$inferSelect;

/** Connected with a token and not in trouble. Seeded sample accounts have no token. */
export const canPublish = (a: Account) => Boolean(a.accessTokenEnc) && (a.status === "active" || a.status === "expiring");

export async function loadBundle(tx: Tx, contentItemId: string) {
  const [row] = await tx
    .select({ item: contentItems, space: spaces, orgSlug: organizations.slug, status: statuses })
    .from(contentItems)
    .innerJoin(spaces, eq(spaces.id, contentItems.spaceId))
    .innerJoin(organizations, eq(organizations.id, contentItems.orgId))
    .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
    .where(eq(contentItems.id, contentItemId));
  if (!row) return null;
  const [pl, accounts, attached, [approval]] = await Promise.all([
    tx.select().from(placements).where(eq(placements.contentItemId, contentItemId)).orderBy(placements.createdAt),
    tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, row.space.id)),
    mediaForContent(tx, [contentItemId]),
    tx.select().from(approvals).where(and(eq(approvals.contentItemId, contentItemId))).orderBy(desc(approvals.createdAt)).limit(1),
  ]);
  const media = attached.map((m) => m.asset);
  const hash = contentVersionHash({
    title: row.item.title,
    caption: row.item.caption,
    hashtags: row.item.hashtags,
    placements: pl.map((p) => ({ kind: p.kind, captionOverride: p.captionOverride })),
    media: media.map((m) => m.id),
  });

  /** The placement's account, or the space's one publishable account on that platform. */
  const accountFor = (p: typeof placements.$inferSelect): Account | null => {
    const platform = PLACEMENTS[p.kind as PlacementKind].platform;
    const chosen = accounts.find((a) => a.id === p.socialAccountId) ?? null;
    if (chosen && canPublish(chosen)) return chosen;
    const live = accounts.filter((a) => a.platform === platform && canPublish(a));
    if (live.length === 1) return live[0];
    return chosen ?? accounts.find((a) => a.platform === platform && a.status !== "disconnected") ?? null;
  };

  return {
    ...row,
    placements: pl.map((p) => ({ ...p, account: accountFor(p) })),
    media,
    approved: approval?.decision === "approved" && approval.versionHash === hash,
    itemHref: `/o/${row.orgSlug}/s/${row.space.slug}/board?content=${row.item.id}`,
  };
}

export type Bundle = NonNullable<Awaited<ReturnType<typeof loadBundle>>>;

export function readinessInput(
  b: Bundle,
  opts: { mode: ReadinessInput["mode"]; when: Date | null; now: Date; mediaReachable: boolean; only?: string },
): ReadinessInput {
  return {
    mode: opts.mode,
    when: opts.when,
    now: opts.now,
    item: { caption: b.item.caption, hashtags: b.item.hashtags, firstComment: b.item.firstComment },
    status: { name: b.status.name, autopostEligible: b.status.autopostEligible },
    requireApproval: b.space.requireClientApproval,
    approved: b.approved,
    placements: b.placements
      .filter((p) => !opts.only || p.id === opts.only)
      .map((p) => ({
        id: p.id,
        kind: p.kind as PlacementKind,
        state: p.state,
        captionOverride: p.captionOverride,
        account: p.account ? { handle: p.account.handle, status: p.account.status, canPublish: canPublish(p.account) } : null,
      })),
    media: b.media.map((m) => ({
      id: m.id,
      type: m.type,
      status: m.status,
      filename: m.filename,
      sizeBytes: m.sizeBytes,
      width: m.width,
      height: m.height,
      durationSeconds: m.durationSeconds,
    })),
    mediaReachable: opts.mediaReachable,
  };
}
