// AI › Prompts, Persona, Workflows and Runs: what each page reads, and the checks on changes.
import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getSystemDb, withOrg } from "@/db";
import { aiPersonas, aiPrompts, aiWorkflowRuns, aiWorkflows, spaces } from "@/db/schema";
import { nextRunAt, startRun, WORKFLOW_TEMPLATES, type Cadence, type WorkflowKind } from "@/ai/workflows";
import { listVisibleSpaces, requireSpaceAction, type OrgContext } from "@/server/tenancy";

const manager = (ctx: OrgContext) => ctx.role === "owner" || ctx.role === "admin";

/* ---------- Prompts ---------- */

export async function listPrompts(ctx: OrgContext) {
  return withOrg(ctx.org.id, (tx) => tx.select().from(aiPrompts).where(eq(aiPrompts.userId, ctx.user.id)).orderBy(desc(aiPrompts.updatedAt)));
}

export async function savePrompt(ctx: OrgContext, input: { id?: string; title: string; body: string }) {
  await withOrg(ctx.org.id, async (tx) => {
    if (input.id) {
      const done = await tx
        .update(aiPrompts)
        .set({ title: input.title, body: input.body, updatedAt: new Date() })
        .where(and(eq(aiPrompts.id, input.id), eq(aiPrompts.userId, ctx.user.id)))
        .returning({ id: aiPrompts.id });
      if (!done.length) throw new Error("That prompt isn’t yours to change.");
    } else await tx.insert(aiPrompts).values({ orgId: ctx.org.id, userId: ctx.user.id, title: input.title, body: input.body });
  });
}

export async function deletePrompt(ctx: OrgContext, id: string) {
  await withOrg(ctx.org.id, (tx) => tx.delete(aiPrompts).where(and(eq(aiPrompts.id, id), eq(aiPrompts.userId, ctx.user.id))));
}

/* ---------- Persona ---------- */

export type Persona = { role: string; about: string; voice: string; avoid: string; website: string };

export async function getPersona(orgId: string, userId: string): Promise<Persona | null> {
  const [p] = await withOrg(orgId, (tx) => tx.select().from(aiPersonas).where(eq(aiPersonas.userId, userId)));
  return p ? { role: p.role, about: p.about, voice: p.voice, avoid: p.avoid, website: p.website } : null;
}

export async function savePersona(ctx: OrgContext, persona: Persona) {
  await withOrg(ctx.org.id, (tx) =>
    tx
      .insert(aiPersonas)
      .values({ orgId: ctx.org.id, userId: ctx.user.id, ...persona })
      .onConflictDoUpdate({ target: [aiPersonas.orgId, aiPersonas.userId], set: { ...persona, updatedAt: new Date() } }),
  );
}

export async function deletePersona(ctx: OrgContext) {
  await withOrg(ctx.org.id, (tx) => tx.delete(aiPersonas).where(eq(aiPersonas.userId, ctx.user.id)));
}

/** The persona as a few lines for the Copilot's system prompt, or nothing when it's empty. */
export function personaText(p: Persona | null) {
  if (!p) return "";
  const lines = [p.role && `Their role: ${p.role}`, p.about && `About them and their work: ${p.about}`, p.voice && `How they like to write: ${p.voice}`, p.avoid && `Avoid: ${p.avoid}`, p.website && `Website: ${p.website}`].filter(Boolean);
  return lines.length ? `About the person you're helping (their persona):\n${lines.join("\n")}` : "";
}

/* ---------- Workflows ---------- */

export interface WorkflowInput {
  kind: WorkflowKind;
  space: string | null;
  name: string;
  prompt: string;
  cadence: Cadence;
  weekday: number;
  hour: number;
}

/** Workflows the person can see: their own, or every one for Owners and Admins. */
export async function listWorkflows(ctx: OrgContext) {
  const visible = new Set((await listVisibleSpaces(ctx.org.slug)).map((s) => s.id));
  return withOrg(ctx.org.id, async (tx) => {
    const rows = await tx
      .select({ w: aiWorkflows, spaceName: spaces.name, spaceSlug: spaces.slug })
      .from(aiWorkflows)
      .leftJoin(spaces, eq(spaces.id, aiWorkflows.spaceId))
      .where(manager(ctx) ? undefined : eq(aiWorkflows.createdBy, ctx.user.id))
      .orderBy(desc(aiWorkflows.createdAt));
    return rows.filter((r) => !r.w.spaceId || visible.has(r.w.spaceId));
  });
}

async function ownWorkflow(ctx: OrgContext, id: string) {
  const [w] = await withOrg(ctx.org.id, (tx) => tx.select().from(aiWorkflows).where(eq(aiWorkflows.id, id)));
  if (!w || (!manager(ctx) && w.createdBy !== ctx.user.id)) throw new Error("That workflow isn’t yours to change.");
  return w;
}

export async function createWorkflow(ctx: OrgContext, input: WorkflowInput) {
  const template = WORKFLOW_TEMPLATES[input.kind];
  let spaceId: string | null = null;
  let tz = ctx.org.timezone;
  if (input.space) {
    const sctx = await requireSpaceAction(ctx.org.slug, input.space, "ai.use");
    spaceId = sctx.space.id;
    tz = sctx.space.timezone;
  } else if (template.scope === "space") throw new Error("Choose the space this workflow is for.");
  else if (!manager(ctx)) throw new Error("Only Owners and Admins can make workflows for the whole organisation. Choose a space.");
  if (input.kind === "custom" && input.prompt.trim().length < 10) throw new Error("Say what the workflow should do, in a sentence or two.");
  const [w] = await withOrg(ctx.org.id, (tx) =>
    tx
      .insert(aiWorkflows)
      .values({ orgId: ctx.org.id, spaceId, createdBy: ctx.user.id, kind: input.kind, name: input.name || template.name, prompt: input.prompt, cadence: input.cadence, weekday: input.weekday, hour: input.hour, nextRunAt: nextRunAt(input, tz, new Date()) })
      .returning(),
  );
  return w;
}

export async function setWorkflowEnabled(ctx: OrgContext, id: string, enabled: boolean) {
  const w = await ownWorkflow(ctx, id);
  const [sp] = w.spaceId ? await withOrg(ctx.org.id, (tx) => tx.select({ tz: spaces.timezone }).from(spaces).where(eq(spaces.id, w.spaceId!))) : [];
  // Turning it back on schedules from now, so it doesn't run for the time it was off.
  await withOrg(ctx.org.id, (tx) => tx.update(aiWorkflows).set({ enabled, nextRunAt: nextRunAt(w, sp?.tz ?? ctx.org.timezone, new Date()) }).where(eq(aiWorkflows.id, id)));
}

export async function deleteWorkflow(ctx: OrgContext, id: string) {
  await ownWorkflow(ctx, id);
  await withOrg(ctx.org.id, (tx) => tx.delete(aiWorkflows).where(eq(aiWorkflows.id, id)));
}

export async function runWorkflowNow(ctx: OrgContext, id: string) {
  await ownWorkflow(ctx, id);
  return startRun(await getSystemDb(), ctx.org.id, id, "manual");
}

/* ---------- Runs ---------- */

export async function listRuns(ctx: OrgContext, statuses: string[]) {
  const ids = (await listWorkflows(ctx)).map((r) => r.w.id);
  if (!ids.length) return [];
  return withOrg(ctx.org.id, (tx) =>
    tx
      .select({ run: aiWorkflowRuns, name: aiWorkflows.name, kind: aiWorkflows.kind })
      .from(aiWorkflowRuns)
      .innerJoin(aiWorkflows, eq(aiWorkflows.id, aiWorkflowRuns.workflowId))
      .where(and(inArray(aiWorkflowRuns.workflowId, ids), statuses.length ? inArray(aiWorkflowRuns.status, statuses as (typeof aiWorkflowRuns.$inferSelect)["status"][]) : undefined))
      .orderBy(desc(aiWorkflowRuns.createdAt))
      .limit(100),
  );
}

/** Runs this month across the organisation, for the usage line on Workflows. */
export async function runsThisMonth(ctx: OrgContext) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [{ n }] = await withOrg(ctx.org.id, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(aiWorkflowRuns).where(gte(aiWorkflowRuns.createdAt, start)));
  return n;
}
