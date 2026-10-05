"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PlanRow, StrategyDoc, StrategyInputs } from "@/lib/strategy";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import {
  addMoment,
  addPlanToCalendar,
  addVersion,
  currentDoc,
  deleteMoment,
  loadStrategyPage,
  momentToIdea,
  restoreVersion,
  saveInputs,
  savePlan,
  shareStrategy,
  starterFor,
  starterPlan,
  strategyContext,
  unshareStrategy,
} from "@/server/strategy";
import { requireSpaceAction } from "@/server/tenancy";
import { appUrl } from "@/server/url";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof z.ZodError ? (e.issues[0] ? `${e.issues[0].path.join(" ")}: ${e.issues[0].message}` : "Something isn’t valid.") : e instanceof Error ? e.message : "Something went wrong.",
});
const refresh = (org: string, space: string) => revalidatePath(`/o/${org}/s/${space}/strategy`);

async function aiReady(org: string, space: string) {
  const ctx = await requireSpaceAction(org, space, "ai.use");
  const { creditsUsedThisMonth } = await import("@/server/ai/service");
  if ((await creditsUsedThisMonth(ctx.org.id)) >= ctx.org.aiMonthlyCredits) throw new Error("This month’s AI budget is used up.");
  return ctx;
}

/** SG-01 → SG-02: save the wizard, then build the strategy from data, or write it with AI. */
export async function createStrategy(org: string, space: string, rawInputs: unknown, mode: "starter" | "ai"): Promise<Result<{ version: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    await saveInputs(ctx, StrategyInputs.parse(rawInputs));
    const page = await strategyContext(ctx);
    const starter = starterFor(ctx, page);
    if (mode === "starter") {
      const version = await addVersion(ctx, starter, "starter");
      refresh(org, space);
      return { ok: true, version };
    }
    await aiReady(org, space);
    const { writeStrategy, recordUsage, aiErrorMessage } = await import("@/server/ai/service");
    try {
      const { doc, usage, model } = await writeStrategy({
        inputs: page.inputs,
        history: page.history,
        brand: page.brain && { ...page.brain, captionLanguage: page.brain.captionLanguage as "en" | "hi" | "hinglish" },
        moments: page.moments.slice(0, 10),
        starter,
      });
      await recordUsage({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: ctx.space.id, kind: "strategy", model, usage });
      const version = await addVersion(ctx, doc, "ai");
      refresh(org, space);
      return { ok: true, version };
    } catch (e) {
      return { ok: false, error: aiErrorMessage(e) };
    }
  } catch (e) {
    return fail(e);
  }
}

export async function saveStrategyEdit(org: string, space: string, doc: unknown): Promise<Result<{ version: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    const version = await addVersion(ctx, StrategyDoc.parse(doc), "edit");
    refresh(org, space);
    return { ok: true, version };
  } catch (e) {
    return fail(e);
  }
}

export async function restore(org: string, space: string, version: number): Promise<Result<{ version: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    const v = await restoreVersion(ctx, z.number().int().min(1).parse(version));
    refresh(org, space);
    return { ok: true, version: v };
  } catch (e) {
    return fail(e);
  }
}

export async function share(org: string, space: string): Promise<Result<{ url: string }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    const token = await shareStrategy(ctx);
    refresh(org, space);
    return { ok: true, url: `${await appUrl()}/strategy/${token}` };
  } catch (e) {
    return fail(e);
  }
}

export async function unshare(org: string, space: string): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "space.settings");
    await unshareStrategy(ctx);
    refresh(org, space);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** SG-03: "Plan 30 days", from the current strategy; with AI, topics, hooks and CTAs are written for each slot. */
export async function makePlan(org: string, space: string, mode: "starter" | "ai"): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const doc = await currentDoc(ctx);
    if (!doc) return { ok: false, error: "Create the strategy first: the plan follows its pillars and cadence." };
    const page = await loadStrategyPage(ctx);
    const { start, rows } = starterPlan(ctx, page, doc);
    if (mode === "starter") {
      await savePlan(ctx, rows, "starter", start);
      refresh(org, space);
      return { ok: true };
    }
    await aiReady(org, space);
    const { planWithAi, recordUsage, aiErrorMessage, getBrandBrain } = await import("@/server/ai/service");
    try {
      const brand = await getBrandBrain(ctx.org.id, ctx.space.id);
      const moments = new Map(page.moments.map((m) => [m.id, m.name]));
      const out = await planWithAi({
        doc,
        inputs: page.inputs,
        brand: brand && { ...brand, captionLanguage: brand.captionLanguage as "en" | "hi" | "hinglish" },
        slots: rows.map((r) => ({ date: r.date, time: r.time, platform: r.platform, format: r.format, pillar: r.pillar, topic: r.topic, ...(r.momentId ? { momentName: moments.get(r.momentId) } : {}) })),
      });
      await recordUsage({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: ctx.space.id, kind: "plan", model: out.model, usage: out.usage });
      // Keep our slots (dates, formats, pillars, ideas, moments); take the model's words.
      const merged = rows.map((r, i) => {
        const ai = out.rows[i];
        if (!ai) return r;
        const format = (ai.format in PLACEMENTS ? ai.format : r.format) as PlacementKind;
        return { ...r, format: PLACEMENTS[format].platform === r.platform ? format : r.format, topic: ai.topic.slice(0, 200) || r.topic, hook: ai.hook.slice(0, 300), cta: ai.cta.slice(0, 200) || r.cta };
      });
      await savePlan(ctx, merged, "ai", start);
      refresh(org, space);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: aiErrorMessage(e) };
    }
  } catch (e) {
    return fail(e);
  }
}

export async function updatePlan(org: string, space: string, rows: unknown, startsOn: string): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    await savePlan(ctx, z.array(PlanRow).max(80).parse(rows), "edit", z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(startsOn));
    refresh(org, space);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addToCalendar(org: string, space: string, rowIds: string[]): Promise<Result<{ added: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const added = await addPlanToCalendar(ctx, z.array(z.string().max(60)).max(80).parse(rowIds));
    revalidatePath(`/o/${org}/s/${space}`, "layout");
    return { ok: true, added };
  } catch (e) {
    return fail(e);
  }
}

const MomentInput = z.object({ name: z.string().trim().min(1).max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(300).default("") });

export async function addCustomMoment(org: string, space: string, input: unknown): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    await addMoment(ctx, MomentInput.parse(input));
    refresh(org, space);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCustomMoment(org: string, space: string, id: string): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    await deleteMoment(ctx, z.uuid().parse(id));
    refresh(org, space);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function momentIdea(org: string, space: string, moment: { name: string; date: string; idea?: string }): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    await momentToIdea(ctx, z.object({ name: z.string().max(80), date: z.string().max(10), idea: z.string().max(300).optional() }).parse(moment));
    revalidatePath(`/o/${org}/s/${space}/ideas`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
