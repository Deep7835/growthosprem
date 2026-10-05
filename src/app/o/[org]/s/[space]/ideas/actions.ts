"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { ideas } from "@/db/schema";
import { IDEA_SOURCES, type IdeaSource } from "@/lib/ideas";
import { applyPillars, createIdeas, deleteIdeas, turnIntoContent, updateIdea, type IdeaInput } from "@/server/ideas";
import { requireSpaceAction } from "@/server/tenancy";

const id = z.uuid();
const Input = z.object({
  title: z.string().max(300).optional(),
  notes: z.string().max(6000).optional(),
  source: z.enum(Object.keys(IDEA_SOURCES) as [IdeaSource, ...IdeaSource[]]).optional(),
  pillar: z.string().max(80).nullable().optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  links: z.array(z.object({ url: z.string().max(2000), title: z.string().max(200).optional() })).max(20).optional(),
  mediaIds: z.array(z.uuid()).max(12).optional(),
});

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof z.ZodError ? "Something in that idea isn’t valid." : e instanceof Error ? e.message : "Something went wrong." });
const refresh = (org: string, space: string) => revalidatePath(`/o/${org}/s/${space}/ideas`);

export async function addIdea(org: string, space: string, input: IdeaInput): Promise<Result<{ id: string }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const [row] = await createIdeas(ctx, [Input.parse(input)]);
    refresh(org, space);
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function editIdea(org: string, space: string, ideaId: string, input: IdeaInput): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    await updateIdea(ctx, id.parse(ideaId), Input.parse(input));
    refresh(org, space);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeIdeas(org: string, space: string, ids: string[]): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    await deleteIdeas(ctx, z.array(id).max(200).parse(ids));
    refresh(org, space);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** "Turn into content" (VW-07). Returns the new draft's id so the page can open it. */
export async function toContent(org: string, space: string, ideaId: string): Promise<Result<{ contentId: string }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const contentId = await turnIntoContent(ctx, id.parse(ideaId));
    revalidatePath(`/o/${org}/s/${space}`, "layout");
    return { ok: true, contentId };
  } catch (e) {
    return fail(e);
  }
}

/** "Sort into pillars with AI": suggestions for ideas without a pillar, shown for approval. */
export async function suggestPillars(org: string, space: string): Promise<Result<{ assignments: { id: string; pillar: string }[] }>> {
  const { aiErrorMessage, creditsUsedThisMonth, getBrandBrain, recordUsage, suggestIdeaPillars } = await import("@/server/ai/service");
  try {
    const ctx = await requireSpaceAction(org, space, "ai.use");
    if ((await creditsUsedThisMonth(ctx.org.id)) >= ctx.org.aiMonthlyCredits) return { ok: false, error: "This month’s AI budget is used up." };
    const { listIdeas } = await import("@/server/ideas");
    const { ideas: all, pillars } = await listIdeas(ctx);
    const unsorted = all.filter((i) => !i.pillar && !i.contentItemId).slice(0, 60);
    if (unsorted.length === 0) return { ok: false, error: "Every idea already has a pillar." };
    try {
      const brand = await getBrandBrain(ctx.org.id, ctx.space.id);
      const { assignments, usage, model } = await suggestIdeaPillars({
        ideas: unsorted.map((i) => ({ id: i.id, title: i.title, notes: i.notes })),
        pillars,
        brand: brand && { ...brand, captionLanguage: brand.captionLanguage as "en" | "hi" | "hinglish" },
      });
      await recordUsage({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: ctx.space.id, kind: "ideas", model, usage });
      return { ok: true, assignments };
    } catch (e) {
      return { ok: false, error: aiErrorMessage(e) };
    }
  } catch (e) {
    return fail(e);
  }
}

export async function acceptPillars(org: string, space: string, assignments: { id: string; pillar: string }[]): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const list = z.array(z.object({ id, pillar: z.string().min(1).max(80) })).max(100).parse(assignments);
    // Only ideas that still have no pillar: someone may have set one meanwhile.
    const open = await withOrg(ctx.org.id, (tx) => tx.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.spaceId, ctx.space.id), isNull(ideas.pillar))));
    await applyPillars(ctx, list.filter((a) => open.some((o) => o.id === a.id)));
    refresh(org, space);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
