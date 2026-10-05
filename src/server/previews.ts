import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { withOrg } from "@/db";
import { mediaForContent } from "@/db/media";
import { contentItems, placements, socialAccounts, statuses } from "@/db/schema";
import { formatSchedule } from "@/lib/format";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import { buildPreviews, type PreviewPost } from "@/lib/preview";
import { checkReadiness } from "@/lib/publishing/rules";
import type { SpaceContext } from "./tenancy";

type Account = typeof socialAccounts.$inferSelect;
type Asset = Awaited<ReturnType<typeof mediaForContent>>[number]["asset"];

export const mediaSrc = (org: string, space: string) => (id: string, variant: "original" | "thumb") =>
  `/api/o/${org}/s/${space}/media/${id}${variant === "thumb" ? "?v=thumb" : ""}`;

/** The account a placement posts as: its own, or the space's one account on that platform. */
export function accountFor(kind: PlacementKind, chosenId: string | null, accounts: Account[]) {
  const chosen = accounts.find((a) => a.id === chosenId && a.status !== "disconnected");
  if (chosen) return chosen;
  const platform = PLACEMENTS[kind].platform;
  return accounts.find((a) => a.platform === platform && a.status !== "disconnected") ?? null;
}

/**
 * Previews for one post. Only media and caption rules matter here, so the readiness check runs
 * as if everything else (account, approval, status) were fine.
 */
export function previewsFor(input: {
  item: { caption: string; hashtags: string; firstComment: string; scheduledAt: Date | null };
  placements: { id: string; kind: PlacementKind; state: string; captionOverride: string | null; socialAccountId: string | null }[];
  assets: Asset[];
  accounts: Account[];
  space: { name: string; avatarColor: string; timezone: string };
  src: (id: string, variant: "original" | "thumb") => string;
}): PreviewPost[] {
  const media = input.assets.filter((a) => a.status === "ready");
  const issues = checkReadiness({
    mode: "now",
    when: null,
    now: new Date(0),
    item: input.item,
    status: { name: "", autopostEligible: true },
    requireApproval: false,
    approved: true,
    placements: input.placements.map((p) => ({ id: p.id, kind: p.kind, state: "draft", captionOverride: p.captionOverride, account: { handle: "", status: "active", canPublish: true } })),
    media: input.assets.map((a) => ({ id: a.id, type: a.type, status: a.status, filename: a.filename, sizeBytes: a.sizeBytes, width: a.width, height: a.height, durationSeconds: a.durationSeconds })),
    mediaReachable: true,
  });
  return buildPreviews({
    item: input.item,
    placements: input.placements.map((p) => {
      const a = accountFor(p.kind, p.socialAccountId, input.accounts);
      return { id: p.id, kind: p.kind, captionOverride: p.captionOverride, account: a ? { handle: a.handle, name: a.name ?? a.handle.replace(/^@/, "") } : null };
    }),
    media: media.map((m) => ({ id: m.id, type: m.type, width: m.width, height: m.height, hasThumb: Boolean(m.thumbKey) })),
    space: { name: input.space.name, color: input.space.avatarColor },
    when: formatSchedule(input.item.scheduledAt, input.space.timezone),
    issues,
    src: input.src,
  });
}

export type PreviewRange = "upcoming" | "month" | "unscheduled" | "all";

/** VW-05: every post in the space as it will look, newest plans first. */
export async function loadSpacePreviews(ctx: SpaceContext, opts: { org: string; space: string; kind: PlacementKind | "all"; range: PreviewRange }) {
  const now = new Date(ctx.requestTime);
  const monthAhead = new Date(ctx.requestTime + 31 * 864e5);
  return withOrg(ctx.org.id, async (tx) => {
    const rangeFilter =
      opts.range === "upcoming"
        ? gte(contentItems.scheduledAt, now)
        : opts.range === "month"
          ? and(gte(contentItems.scheduledAt, now), lt(contentItems.scheduledAt, monthAhead))
          : opts.range === "unscheduled"
            ? isNull(contentItems.scheduledAt)
            : undefined;
    const rows = await tx
      .select({ item: contentItems, status: statuses })
      .from(contentItems)
      .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
      .where(and(eq(contentItems.spaceId, ctx.space.id), rangeFilter))
      .orderBy(asc(contentItems.scheduledAt), asc(contentItems.position))
      .limit(120);
    const ids = rows.map((r) => r.item.id);
    const [pl, accounts, media] = await Promise.all([
      ids.length ? tx.select().from(placements).where(inArray(placements.contentItemId, ids)).orderBy(asc(placements.createdAt)) : [],
      tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id)),
      mediaForContent(tx, ids),
    ]);
    const src = mediaSrc(opts.org, opts.space);
    return rows
      .map(({ item, status }) => {
        const mine = pl.filter((p) => p.contentItemId === item.id && (opts.kind === "all" || p.kind === opts.kind));
        return {
          id: item.id,
          title: item.title,
          when: formatSchedule(item.scheduledAt, ctx.space.timezone),
          status: { name: status.name, color: status.color },
          publishState: item.publishState,
          previews: previewsFor({
            item,
            placements: mine.map((p) => ({ ...p, kind: p.kind as PlacementKind })),
            assets: media.filter((m) => m.contentId === item.id).map((m) => m.asset),
            accounts,
            space: ctx.space,
            src,
          }),
        };
      })
      .filter((r) => r.previews.length > 0 || opts.kind === "all");
  });
}
