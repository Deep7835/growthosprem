import "server-only";
import { and, asc, eq, gte, inArray, max } from "drizzle-orm";
import { withOrg, type Db } from "@/db/core";
import { aiActions, contentItems, placements, socialAccounts, spaces, statuses } from "@/db/schema";
import { zonedToUtc } from "@/lib/analytics/time";
import { PLACEMENTS } from "@/lib/placements";
import { logActivity } from "@/server/activity";
import { returnToReviewIfApproved } from "@/server/approval";
import { ProposeCaptions, ProposeDraftPosts } from "./schemas";

type Person = { id: string; name: string };

/**
 * Carries out an approved action card (AI-05, AI-06). The payload is the card as the
 * person left it after editing, validated again here. Changes are logged as
 * "by AI Copilot for <person>".
 */
export async function executeAction(db: Db, orgId: string, actionId: string, person: Person, editedPayload?: unknown) {
  return withOrg(db, orgId, async (tx) => {
    const [action] = await tx.select().from(aiActions).where(eq(aiActions.id, actionId));
    if (!action) throw new Error("Action not found.");
    if (action.state !== "proposed") throw new Error("This card was already handled.");
    const [space] = await tx.select().from(spaces).where(eq(spaces.id, action.spaceId));
    const actor = { kind: "ai" as const, userId: person.id, name: person.name };
    let result: Record<string, unknown>;

    if (action.tool === "propose_draft_posts") {
      const payload = ProposeDraftPosts.parse(editedPayload ?? action.payload);
      const [first] = await tx
        .select()
        .from(statuses)
        .where(and(eq(statuses.spaceId, space.id), eq(statuses.category, "not_started"), eq(statuses.appliesTo, "content")))
        .orderBy(asc(statuses.position))
        .limit(1);
      if (!first) throw new Error("This space has no “Not started” status for drafts.");
      const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, space.id));
      const [{ top }] = await tx.select({ top: max(contentItems.position) }).from(contentItems).where(eq(contentItems.spaceId, space.id));
      const ids: string[] = [];
      for (const [i, post] of payload.posts.entries()) {
        const [y, m, d] = post.date.split("-").map(Number);
        const [hh, mm] = post.time.split(":").map(Number);
        const [item] = await tx
          .insert(contentItems)
          .values({
            orgId,
            spaceId: space.id,
            title: post.title,
            statusId: first.id,
            pillar: post.pillar ?? null,
            caption: post.caption ?? "",
            scheduledAt: zonedToUtc(y, m, d, hh, mm, space.timezone),
            position: (top ?? 0) + i + 1,
            createdBy: person.id,
          })
          .returning();
        await tx.insert(placements).values(
          [...new Set(post.placements)].map((kind) => ({
            orgId,
            contentItemId: item.id,
            kind,
            socialAccountId: accounts.find((a) => a.platform === PLACEMENTS[kind].platform)?.id ?? null,
          })),
        );
        await logActivity(tx, { orgId, spaceId: space.id, contentItemId: item.id, actor, action: "created" });
        ids.push(item.id);
      }
      result = { contentIds: ids };
    } else if (action.tool === "propose_captions") {
      const payload = ProposeCaptions.parse(editedPayload ?? action.payload);
      const items = await tx
        .select()
        .from(contentItems)
        .where(and(inArray(contentItems.id, payload.changes.map((c) => c.post_id)), eq(contentItems.spaceId, space.id)));
      const before: { id: string; caption: string; hashtags: string }[] = [];
      for (const change of payload.changes) {
        const item = items.find((i) => i.id === change.post_id);
        if (!item) throw new Error("A post on this card no longer exists.");
        before.push({ id: item.id, caption: item.caption, hashtags: item.hashtags });
        await tx
          .update(contentItems)
          .set({ caption: change.caption, ...(change.hashtags !== undefined ? { hashtags: change.hashtags } : {}), updatedAt: new Date() })
          .where(eq(contentItems.id, item.id));
        await logActivity(tx, { orgId, spaceId: space.id, contentItemId: item.id, actor, action: "updated", field: "caption", before: item.caption, after: change.caption });
        await returnToReviewIfApproved(tx, item);
      }
      result = { before, after: payload.changes };
    } else {
      throw new Error(`Unknown action ${action.tool}.`);
    }

    await tx
      .update(aiActions)
      .set({ state: "executed", payload: editedPayload ?? action.payload, result, resolvedBy: person.id, resolvedAt: new Date() })
      .where(eq(aiActions.id, action.id));
    return { tool: action.tool, spaceSlug: space.slug, result };
  });
}

export async function dismissAction(db: Db, orgId: string, actionId: string, person: Person) {
  await withOrg(db, orgId, (tx) =>
    tx
      .update(aiActions)
      .set({ state: "dismissed", resolvedBy: person.id, resolvedAt: new Date() })
      .where(and(eq(aiActions.id, actionId), eq(aiActions.state, "proposed"))),
  );
}

/**
 * Undo (AI-06): removes drafts the action created if nobody has moved them on, or
 * restores captions nobody has edited since. Anything changed by a person is kept.
 */
export async function undoAction(db: Db, orgId: string, actionId: string, person: Person) {
  return withOrg(db, orgId, async (tx) => {
    const [action] = await tx.select().from(aiActions).where(eq(aiActions.id, actionId));
    if (!action || action.state !== "executed") throw new Error("Only an approved card can be undone.");
    const result = action.result as Record<string, unknown>;
    let kept = 0;
    if (action.tool === "propose_draft_posts") {
      const ids = (result.contentIds as string[]) ?? [];
      const notStarted = (await tx.select({ id: statuses.id }).from(statuses).where(and(eq(statuses.spaceId, action.spaceId), eq(statuses.category, "not_started")))).map((s) => s.id);
      const removed = ids.length
        ? await tx
            .delete(contentItems)
            .where(and(inArray(contentItems.id, ids), inArray(contentItems.statusId, notStarted), gte(contentItems.createdAt, action.createdAt)))
            .returning({ id: contentItems.id })
        : [];
      kept = ids.length - removed.length;
    } else if (action.tool === "propose_captions") {
      const before = result.before as { id: string; caption: string; hashtags: string }[];
      const after = result.after as { post_id: string; caption: string }[];
      for (const b of before) {
        const [item] = await tx.select().from(contentItems).where(eq(contentItems.id, b.id));
        if (!item || item.caption !== after.find((a) => a.post_id === b.id)?.caption) {
          kept++;
          continue;
        }
        await tx.update(contentItems).set({ caption: b.caption, hashtags: b.hashtags, updatedAt: new Date() }).where(eq(contentItems.id, b.id));
        await logActivity(tx, { orgId, spaceId: action.spaceId, contentItemId: b.id, actor: { kind: "user", userId: person.id, name: person.name }, action: "undid the AI caption change" });
      }
    }
    await tx.update(aiActions).set({ state: "undone", resolvedAt: new Date() }).where(eq(aiActions.id, action.id));
    return { kept };
  });
}
