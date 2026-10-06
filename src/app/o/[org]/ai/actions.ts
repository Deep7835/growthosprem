"use server";

import { and, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSystemDb, withOrg } from "@/db";
import { aiActions, aiConversations, organizations, posts, spaces } from "@/db/schema";
import { canManageMembers } from "@/lib/permissions";
import { dismissAction, executeAction, undoAction } from "@/server/ai/execute";
import { getOrgContext, requireSpaceAction } from "@/server/tenancy";

/** The card, if it belongs to this person's own conversation, and their right to change its space. */
async function ownCard(org: string, actionId: string) {
  const ctx = await getOrgContext(org);
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx
      .select({ action: aiActions, conversation: aiConversations, spaceSlug: spaces.slug })
      .from(aiActions)
      .innerJoin(aiConversations, eq(aiConversations.id, aiActions.conversationId))
      .innerJoin(spaces, eq(spaces.id, aiActions.spaceId))
      .where(eq(aiActions.id, z.uuid().parse(actionId))),
  );
  if (!row || row.conversation.userId !== ctx.user.id) throw new Error("Card not found.");
  // The Copilot acts with the permissions of the person approving (AI-14).
  await requireSpaceAction(org, row.spaceSlug, "content.edit");
  return { ctx, row };
}

const done = (org: string, conversationId: string, spaceSlug: string) => {
  revalidatePath(`/o/${org}/ai/c/${conversationId}`);
  revalidatePath(`/o/${org}/s/${spaceSlug}`, "layout");
};

export async function approveAiAction(org: string, actionId: string, payload: unknown) {
  const { ctx, row } = await ownCard(org, actionId);
  await executeAction(await getSystemDb(), ctx.org.id, row.action.id, { id: ctx.user.id, name: ctx.user.name }, payload);
  done(org, row.conversation.id, row.spaceSlug);
}

export async function dismissAiAction(org: string, actionId: string) {
  const { ctx, row } = await ownCard(org, actionId);
  await dismissAction(await getSystemDb(), ctx.org.id, row.action.id, { id: ctx.user.id, name: ctx.user.name });
  done(org, row.conversation.id, row.spaceSlug);
}

export async function undoAiAction(org: string, actionId: string): Promise<{ kept: number }> {
  const { ctx, row } = await ownCard(org, actionId);
  const result = await undoAction(await getSystemDb(), ctx.org.id, row.action.id, { id: ctx.user.id, name: ctx.user.name });
  done(org, row.conversation.id, row.spaceSlug);
  return result;
}

export async function deleteConversation(org: string, conversationId: string) {
  const ctx = await getOrgContext(org);
  await withOrg(ctx.org.id, (tx) =>
    tx.delete(aiConversations).where(and(eq(aiConversations.id, z.uuid().parse(conversationId)), eq(aiConversations.userId, ctx.user.id))),
  );
  revalidatePath(`/o/${org}/ai`, "layout");
  redirect(`/o/${org}/ai`);
}

/** Monthly AI budget, a hard cap (AI-13). Owner and Admin only. */
export async function setAiBudget(org: string, formData: FormData) {
  const ctx = await getOrgContext(org);
  if (!canManageMembers(ctx.role)) throw new Error("Only Owners and Admins can change the AI budget.");
  const credits = z.coerce.number().int().min(0).max(1_000_000).parse(formData.get("credits"));
  await withOrg(ctx.org.id, (tx) => tx.update(organizations).set({ aiMonthlyCredits: credits }).where(eq(organizations.id, ctx.org.id)));
  revalidatePath(`/o/${org}/ai`, "layout");
}

/** Re-tags a space's posts' topics and hooks with AI; pillars and anything set by hand are kept. Owners and Admins. */
export async function retagSpace(org: string, spaceId: string) {
  const ctx = await getOrgContext(org);
  if (!canManageMembers(ctx.role)) throw new Error("Only Owners and Admins can re-tag posts.");
  const id = z.uuid().parse(spaceId);
  await withOrg(ctx.org.id, (tx) =>
    tx
      .update(posts)
      .set({ taggedAt: null, topic: null, hookType: null })
      .where(and(eq(posts.spaceId, id), or(isNull(posts.tagSource), eq(posts.tagSource, "ai")))),
  );
  revalidatePath(`/o/${org}/settings/ai`);
}
