// AI › Workflows: recurring jobs for a space (or the whole organisation), run by the job worker.
// Digests that only read Plotline's data run without AI; the ones that write ideas or commentary
// use the writing model and the organisation's AI budget. Shared with server actions ("Run now"),
// so no Next.js imports.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type Db, type Tx } from "@/db/core";
import {
  aiWorkflowRuns,
  aiWorkflows,
  brandBrains,
  contentItems,
  ideas,
  organizations,
  postMetrics,
  posts,
  spaces,
  statuses,
  subscriptions,
  tasks,
  usageEvents,
  users,
} from "@/db/schema";
import { enqueue, PRIORITY } from "@/jobs/queue";
import { anthropic, credentialsConfigured } from "@/lib/ai/client";
import { WRITING_MODEL, creditsFor, type TokenUsage } from "@/lib/ai/config";
import { addDays, isoDate, zonedParts, zonedToUtc } from "@/lib/analytics/time";
import { phaseOf } from "@/lib/billing/plans";
import { upcomingMoments } from "@/lib/festivals";
import { deliver } from "@/notifications/deliver";

export const WORKFLOW_JOB = "ai.workflow";

export type WorkflowKind = (typeof aiWorkflows.$inferSelect)["kind"];
export type Cadence = (typeof aiWorkflows.$inferSelect)["cadence"];

/** The templates people start from. `ai` ones need ANTHROPIC_API_KEY. */
export const WORKFLOW_TEMPLATES: Record<WorkflowKind, { name: string; group: "Content" | "Reporting" | "Custom"; body: string; ai: "required" | "optional" | "none"; scope: "space" | "any"; cadence: Cadence }> = {
  ideas: { name: "Weekly content ideas", group: "Content", body: "Five fresh post ideas for the space, based on Brand Brain and what's been working, added to its Idea Bank.", ai: "required", scope: "space", cadence: "weekly" },
  festivals: { name: "Festival planner", group: "Content", body: "The festivals and moments in the next 45 days, with post ideas for each added to the Idea Bank.", ai: "optional", scope: "space", cadence: "monthly" },
  analytics: { name: "Weekly analytics digest", group: "Reporting", body: "Last week's posts with views and engagement, the top performers and a short read on what to do next.", ai: "optional", scope: "space", cadence: "weekly" },
  overdue: { name: "Overdue task digest", group: "Reporting", body: "Every open task past its due date, with who it's assigned to, so nothing slips.", ai: "none", scope: "any", cadence: "daily" },
  unscheduled: { name: "Unscheduled content check", group: "Reporting", body: "Posts in progress that still have no date, so they don't stall before review.", ai: "none", scope: "space", cadence: "weekly" },
  custom: { name: "Custom workflow", group: "Custom", body: "Ask the AI anything about a space on a schedule; it reads the space's Brand Brain, recent results and plan.", ai: "required", scope: "space", cadence: "weekly" },
};

/* ---------- Schedule ---------- */

/** The next time the workflow is due after `from`: its local hour on the right day. */
export function nextRunAt(w: { cadence: Cadence; weekday: number; hour: number }, timeZone: string, from: Date): Date {
  const today = zonedParts(from, timeZone);
  for (let i = 0; i < 64; i++) {
    const day = addDays(today, i);
    const at = zonedToUtc(day.year, day.month, day.day, w.hour, 0, timeZone);
    if (at <= from) continue;
    if (w.cadence === "daily") return at;
    if (w.cadence === "weekly" && day.weekday === w.weekday) return at;
    if (w.cadence === "monthly" && day.day === 1) return at;
  }
  return new Date(from.getTime() + 864e5);
}

/** Queues one run of a workflow (on schedule or "Run now"). */
export async function startRun(db: Db, orgId: string, workflowId: string, trigger: "schedule" | "manual") {
  const [run] = await withOrg(db, orgId, (tx) => tx.insert(aiWorkflowRuns).values({ orgId, workflowId, trigger }).returning());
  await enqueue(db, { kind: WORKFLOW_JOB, payload: { runId: run.id, orgId }, priority: PRIORITY.manual, maxAttempts: 1 });
  return run;
}

/** Every minute from the worker: start the workflows that are due and set their next time. */
export async function scheduleWorkflows(db: Db, now = new Date()) {
  const due = await db
    .select({ w: aiWorkflows, spaceTz: spaces.timezone, orgTz: organizations.timezone })
    .from(aiWorkflows)
    .innerJoin(organizations, eq(organizations.id, aiWorkflows.orgId))
    .leftJoin(spaces, eq(spaces.id, aiWorkflows.spaceId))
    .where(and(eq(aiWorkflows.enabled, true), lte(aiWorkflows.nextRunAt, now)));
  for (const { w, spaceTz, orgTz } of due) {
    await withOrg(db, w.orgId, (tx) => tx.update(aiWorkflows).set({ nextRunAt: nextRunAt(w, spaceTz ?? orgTz, now), lastRunAt: now }).where(eq(aiWorkflows.id, w.id)));
    await startRun(db, w.orgId, w.id, "schedule");
  }
  return due.length;
}

/* ---------- The model, replaceable in tests ---------- */

const IdeaList = z.object({ ideas: z.array(z.object({ title: z.string(), notes: z.string(), pillar: z.string() })) });
export type IdeaDraft = z.infer<typeof IdeaList>["ideas"][number];

export interface Writer {
  text: (system: string, prompt: string) => Promise<{ text: string; usage: TokenUsage; model: string }>;
  ideas: (system: string, prompt: string) => Promise<{ ideas: IdeaDraft[]; usage: TokenUsage; model: string }>;
}

const SYSTEM = `You help a social media team in Plotline, a workspace for agencies and brands, mostly in India. You write short, plain, useful text: no headings unless asked, short lists, concrete next steps. Use Indian number grouping for Indian brands. Captions and ideas follow the brand's voice and language.`;

export const claudeWriter: Writer = {
  async text(system, prompt) {
    const api = anthropic();
    if (!api) throw new Error("AI isn’t set up (ANTHROPIC_API_KEY).");
    const r = await api.beta.messages.create({
      model: WRITING_MODEL,
      max_tokens: 1500,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `${SYSTEM}\n\n${system}`,
      messages: [{ role: "user", content: prompt }],
    });
    if (r.stop_reason === "refusal") throw new Error("The AI declined this request.");
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    return { text, usage: r.usage, model: r.model };
  },
  async ideas(system, prompt) {
    const api = anthropic();
    if (!api) throw new Error("AI isn’t set up (ANTHROPIC_API_KEY).");
    const r = await api.beta.messages.parse({
      model: WRITING_MODEL,
      max_tokens: 2500,
      output_config: { effort: "low", format: betaZodOutputFormat(IdeaList) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `${SYSTEM}\n\n${system}`,
      messages: [{ role: "user", content: prompt }],
    });
    if (r.stop_reason === "refusal") throw new Error("The AI declined this request.");
    return { ideas: r.parsed_output?.ideas ?? [], usage: r.usage, model: r.model };
  },
};

/* ---------- Running ---------- */

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const day = (d: Date, tz: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: tz }).format(d);
const num = (n: number) => Math.round(n).toLocaleString("en-IN");

async function brandOf(tx: Tx, spaceId: string) {
  const [b] = await tx.select().from(brandBrains).where(eq(brandBrains.spaceId, spaceId));
  if (!b) return "No Brand Brain yet.";
  return [b.description && `About: ${b.description}`, b.audience && `Audience: ${b.audience}`, b.voice && `Voice: ${b.voice}`, b.dos && `Do: ${b.dos}`, b.donts && `Don't: ${b.donts}`, `Caption language: ${b.captionLanguage}`]
    .filter(Boolean)
    .join("\n");
}

/** Posts published in the last `days` days with their latest numbers. */
async function recentResults(tx: Tx, spaceId: string, now: Date, days: number) {
  const rows = await tx
    .select({ id: posts.id, title: posts.title, format: posts.format, publishedAt: posts.publishedAt })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), gte(posts.publishedAt, new Date(now.getTime() - days * 864e5))))
    .orderBy(desc(posts.publishedAt));
  const metrics = rows.length ? await tx.select().from(postMetrics).where(inArray(postMetrics.postId, rows.map((r) => r.id))) : [];
  const latest = new Map<string, (typeof metrics)[number]>();
  for (const m of metrics) if (!latest.get(m.postId) || latest.get(m.postId)!.takenAt < m.takenAt) latest.set(m.postId, m);
  return rows.map((r) => {
    const m = latest.get(r.id);
    const engagement = (m?.likes ?? 0) + (m?.comments ?? 0) + (m?.saves ?? 0) + (m?.shares ?? 0);
    return { ...r, views: m?.views ?? 0, reach: m?.reach ?? 0, engagement, rate: m?.reach ? engagement / m.reach : 0 };
  });
}

async function addIdeas(tx: Tx, w: typeof aiWorkflows.$inferSelect, list: IdeaDraft[], tag: string) {
  if (!w.spaceId || list.length === 0) return;
  await tx.insert(ideas).values(
    list.slice(0, 12).map((i) => ({ orgId: w.orgId, spaceId: w.spaceId!, title: i.title.slice(0, 200), notes: i.notes.slice(0, 2000), pillar: i.pillar.trim().slice(0, 60) || null, source: "ai" as const, tags: ["workflow", tag], createdBy: w.createdBy })),
  );
}

/** Runs one queued run and records what happened. Never throws for a workflow's own failure. */
export async function runWorkflowJob(db: Db, payload: { runId: string; orgId: string }, deps: { writer?: Writer; now?: Date; aiReady?: boolean } = {}) {
  const now = deps.now ?? new Date();
  const writer = deps.writer ?? claudeWriter;
  const aiReady = deps.aiReady ?? (Boolean(deps.writer) || credentialsConfigured());

  return withOrg(db, payload.orgId, async (tx) => {
    const [run] = await tx.select().from(aiWorkflowRuns).where(eq(aiWorkflowRuns.id, payload.runId));
    if (!run || run.status !== "queued") return null;
    const [w] = await tx.select().from(aiWorkflows).where(eq(aiWorkflows.id, run.workflowId));
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, payload.orgId));
    if (!w || !org) return null;
    await tx.update(aiWorkflowRuns).set({ status: "running", startedAt: now }).where(eq(aiWorkflowRuns.id, run.id));
    const [space] = w.spaceId ? await tx.select().from(spaces).where(eq(spaces.id, w.spaceId)) : [];
    const tz = space?.timezone ?? org.timezone;
    const usage: { model: string; usage: TokenUsage }[] = [];

    const needAi = async () => {
      if (!aiReady) throw new Error("This workflow needs AI, which isn’t set up yet (ANTHROPIC_API_KEY).");
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, org.id));
      if (phaseOf(sub ?? null, org.trialEndsAt, now).locked) throw new Error("The trial or plan has ended, so workflows that use AI are paused.");
      const [{ used }] = await tx.select({ used: sql<number>`coalesce(sum(${usageEvents.credits}), 0)::int` }).from(usageEvents).where(gte(usageEvents.createdAt, monthStart(now)));
      if (used >= org.aiMonthlyCredits) throw new Error("This month’s AI budget is used up.");
    };

    let output: string;
    let failure: string | null = null;
    try {
      if (w.spaceId && (!space || space.archivedAt || space.deletedAt)) throw new Error("Its space is archived or deleted.");
      const spaceIds = w.spaceId ? [w.spaceId] : (await tx.select({ id: spaces.id }).from(spaces).where(and(isNull(spaces.archivedAt), isNull(spaces.deletedAt)))).map((s) => s.id);
      const names = new Map((await tx.select({ id: spaces.id, name: spaces.name }).from(spaces)).map((s) => [s.id, s.name]));

      switch (w.kind) {
        case "overdue": {
          const rows = spaceIds.length
            ? await tx
                .select({ title: tasks.title, dueAt: tasks.dueAt, spaceId: tasks.spaceId, who: users.name })
                .from(tasks)
                .leftJoin(users, eq(users.id, tasks.assigneeId))
                .where(and(inArray(tasks.spaceId, spaceIds), eq(tasks.done, false), lte(tasks.dueAt, now)))
                .orderBy(asc(tasks.dueAt))
            : [];
          output = rows.length
            ? [`${rows.length} overdue task${rows.length === 1 ? "" : "s"}:`, ...rows.map((r) => `• ${r.title} — due ${day(r.dueAt!, tz)} · ${r.who ?? "Unassigned"}${w.spaceId ? "" : ` · ${names.get(r.spaceId)}`}`)].join("\n")
            : "Nothing is overdue. 🎉";
          break;
        }
        case "unscheduled": {
          const rows = await tx
            .select({ title: contentItems.title, status: statuses.name, updatedAt: contentItems.updatedAt })
            .from(contentItems)
            .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
            .where(and(inArray(contentItems.spaceId, spaceIds), isNull(contentItems.archivedAt), isNull(contentItems.scheduledAt), inArray(statuses.category, ["not_started", "active"])))
            .orderBy(asc(contentItems.updatedAt));
          output = rows.length
            ? [`${rows.length} post${rows.length === 1 ? "" : "s"} in progress with no date:`, ...rows.map((r) => `• ${r.title} — ${r.status}, last changed ${day(r.updatedAt, tz)}`)].join("\n")
            : "Every post in progress has a date.";
          break;
        }
        case "analytics": {
          const results = await recentResults(tx, w.spaceId!, now, 7);
          if (!results.length) {
            output = "No posts were published in the last 7 days.";
            break;
          }
          const totalViews = results.reduce((a, r) => a + r.views, 0);
          const totalEng = results.reduce((a, r) => a + r.engagement, 0);
          const top = [...results].sort((a, b) => b.views - a.views).slice(0, 3);
          const numbers = [
            `Last 7 days: ${results.length} post${results.length === 1 ? "" : "s"}, ${num(totalViews)} views, ${num(totalEng)} engagements.`,
            "Top by views:",
            ...top.map((r, i) => `${i + 1}. ${r.title} (${r.format}) — ${num(r.views)} views, ${(r.rate * 100).toFixed(1)}% engagement`),
          ].join("\n");
          if (!aiReady) {
            output = `${numbers}\n\n(Add ANTHROPIC_API_KEY for a short read on what to do next.)`;
            break;
          }
          await needAi();
          const r = await writer.text(`Brand Brain:\n${await brandOf(tx, w.spaceId!)}`, `Here are ${space!.name}'s results for the last 7 days:\n${numbers}\n\nIn 3 to 5 short bullet points: what worked, what didn't, and what to post next week.`);
          usage.push(r);
          output = `${numbers}\n\n${r.text}`;
          break;
        }
        case "ideas": {
          await needAi();
          const results = await recentResults(tx, w.spaceId!, now, 60);
          const top = [...results].sort((a, b) => b.rate - a.rate).slice(0, 8);
          const r = await writer.ideas(
            `Brand Brain:\n${await brandOf(tx, w.spaceId!)}`,
            `Suggest 5 new post ideas for ${space!.name} for the coming week. Recent posts that did best:\n${top.map((p) => `- ${p.title} (${p.format}), ${(p.rate * 100).toFixed(1)}% engagement`).join("\n") || "- none yet"}\nGive each a working title, the angle in 1–2 sentences, and a pillar.`,
          );
          usage.push(r);
          await addIdeas(tx, w, r.ideas, "weekly ideas");
          output = r.ideas.length ? [`Added ${r.ideas.length} ideas to ${space!.name}'s Idea Bank:`, ...r.ideas.map((i) => `• ${i.title} — ${i.notes}`)].join("\n") : "The AI didn't come up with ideas this time.";
          break;
        }
        case "festivals": {
          const p = zonedParts(now, tz);
          const moments = upcomingMoments({ year: p.year, month: p.month, day: p.day }, 45);
          const list = moments.map((m) => `• ${m.name} — ${m.date}${m.approximate ? " (date can vary by a day)" : ""}`).join("\n");
          if (!moments.length) {
            output = "No festivals or moments in the next 45 days.";
            break;
          }
          if (!aiReady) {
            output = `Coming up in the next 45 days:\n${list}\n\n(Add ANTHROPIC_API_KEY to get post ideas for them in the Idea Bank.)`;
            break;
          }
          await needAi();
          const r = await writer.ideas(
            `Brand Brain:\n${await brandOf(tx, w.spaceId!)}`,
            `These festivals and moments are coming up (today is ${isoDate(p)}):\n${list}\n\nSuggest one post idea for each that fits ${space!.name} (skip ones that don't fit the brand), up to 6. Put the festival in the title.`,
          );
          usage.push(r);
          await addIdeas(tx, w, r.ideas, "festivals");
          output = `Coming up in the next 45 days:\n${list}\n\nAdded ${r.ideas.length} idea${r.ideas.length === 1 ? "" : "s"} to the Idea Bank:\n${r.ideas.map((i) => `• ${i.title}`).join("\n")}`;
          break;
        }
        case "custom": {
          await needAi();
          const results = await recentResults(tx, w.spaceId!, now, 30);
          const planned = await tx
            .select({ title: contentItems.title, at: contentItems.scheduledAt })
            .from(contentItems)
            .where(and(eq(contentItems.spaceId, w.spaceId!), isNull(contentItems.archivedAt), gte(contentItems.scheduledAt, now)))
            .orderBy(asc(contentItems.scheduledAt))
            .limit(10);
          const context = [
            `Space: ${space!.name}. Today: ${isoDate(zonedParts(now, tz))} (${tz}).`,
            `Brand Brain:\n${await brandOf(tx, w.spaceId!)}`,
            `Posts in the last 30 days:\n${results.slice(0, 15).map((r) => `- ${r.title} (${r.format}), ${num(r.views)} views, ${(r.rate * 100).toFixed(1)}% engagement`).join("\n") || "- none"}`,
            `Planned next:\n${planned.map((c) => `- ${c.title}, ${day(c.at!, tz)}`).join("\n") || "- nothing planned"}`,
          ].join("\n\n");
          const r = await writer.text(context, w.prompt || "Give me a short update on this space and what to do next.");
          usage.push(r);
          output = r.text;
          break;
        }
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : "The workflow failed.";
      output = "";
    }

    for (const u of usage) {
      await tx.insert(usageEvents).values({
        orgId: org.id,
        userId: w.createdBy,
        spaceId: w.spaceId,
        kind: "workflow",
        model: u.model,
        inputTokens: u.usage.input_tokens,
        outputTokens: u.usage.output_tokens,
        cacheReadTokens: u.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.usage.cache_creation_input_tokens ?? 0,
        credits: creditsFor(u.model, u.usage),
      });
    }
    await tx
      .update(aiWorkflowRuns)
      .set({ status: failure ? "failed" : "completed", output: output!.slice(0, 20000), error: failure, finishedAt: new Date() })
      .where(eq(aiWorkflowRuns.id, run.id));
    if (w.createdBy) {
      await deliver(tx, [w.createdBy], {
        orgId: org.id,
        spaceId: w.spaceId,
        kind: "workflow_run",
        title: failure ? `“${w.name}” couldn’t run` : `“${w.name}” finished`,
        body: (failure ?? output!.split("\n")[0]).slice(0, 280),
        href: `/o/${org.slug}/ai/runs?run=${run.id}`,
      });
    }
    return { status: failure ? ("failed" as const) : ("completed" as const), output: output!, error: failure };
  });
}
