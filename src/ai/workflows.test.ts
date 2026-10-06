import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { nextRunAt, runWorkflowJob, scheduleWorkflows, startRun, type Writer } from "./workflows";

let db: Db;
let org: typeof s.organizations.$inferSelect;
let cafe: typeof s.spaces.$inferSelect;
let prem: typeof s.users.$inferSelect;

const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const fake: Writer = {
  text: async () => ({ text: "• Reels worked best\n• Post at 7 PM", usage, model: "claude-sonnet-5-5" }),
  ideas: async () => ({ ideas: [{ title: "Chai vs coffee poll", notes: "A Story poll", pillar: "Community" }, { title: "Bake-off reel", notes: "Staff bake-off", pillar: "Behind the scenes" }], usage, model: "claude-sonnet-5-5" }),
};

async function workflow(kind: (typeof s.aiWorkflows.$inferSelect)["kind"], spaceId: string | null, prompt = "") {
  const [w] = await db.insert(s.aiWorkflows).values({ orgId: org.id, spaceId, createdBy: prem.id, kind, name: `Test ${kind}`, prompt, nextRunAt: new Date(Date.now() - 1000) }).returning();
  return w;
}

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  [org] = await db.select().from(s.organizations);
  [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  [prem] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
}, 60_000);

describe("workflow schedule", () => {
  const tz = "Asia/Kolkata";
  it("finds the next local hour, weekday or 1st of the month", () => {
    const from = new Date("2026-10-06T05:00:00Z"); // Tue 10:30 IST
    expect(nextRunAt({ cadence: "daily", weekday: 0, hour: 9 }, tz, from).toISOString()).toBe("2026-10-07T03:30:00.000Z");
    expect(nextRunAt({ cadence: "daily", weekday: 0, hour: 18 }, tz, from).toISOString()).toBe("2026-10-06T12:30:00.000Z");
    expect(nextRunAt({ cadence: "weekly", weekday: 0, hour: 9 }, tz, from).toISOString()).toBe("2026-10-12T03:30:00.000Z"); // Monday
    expect(nextRunAt({ cadence: "monthly", weekday: 0, hour: 9 }, tz, from).toISOString()).toBe("2026-11-01T03:30:00.000Z");
  });

  it("starts due workflows once and moves their next time on", async () => {
    const w = await workflow("unscheduled", cafe.id);
    expect(await scheduleWorkflows(db)).toBeGreaterThanOrEqual(1);
    const runs = await db.select().from(s.aiWorkflowRuns).where(eq(s.aiWorkflowRuns.workflowId, w.id));
    expect(runs).toHaveLength(1);
    const [after] = await db.select().from(s.aiWorkflows).where(eq(s.aiWorkflows.id, w.id));
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    await scheduleWorkflows(db);
    expect(await db.select().from(s.aiWorkflowRuns).where(eq(s.aiWorkflowRuns.workflowId, w.id))).toHaveLength(1);
  });
});

describe("workflow runs", () => {
  it("digests overdue tasks without AI and tells the person who made it", async () => {
    const [status] = await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, cafe.id), eq(s.statuses.appliesTo, "task")));
    await db.insert(s.tasks).values({ orgId: org.id, spaceId: cafe.id, title: "Overdue edit", statusId: status.id, dueAt: new Date(Date.now() - 2 * 864e5) });
    const w = await workflow("overdue", null);
    const run = await startRun(db, org.id, w.id, "manual");
    const r = await runWorkflowJob(db, { runId: run.id, orgId: org.id }, { aiReady: false });
    expect(r?.status).toBe("completed");
    expect(r?.output).toContain("Overdue edit");
    const [note] = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, prem.id), eq(s.notifications.kind, "workflow_run")));
    expect(note.href).toBe(`/o/${org.slug}/ai/runs?run=${run.id}`);
  });

  it("adds ideas to the Idea Bank and records the AI usage", async () => {
    const w = await workflow("ideas", cafe.id);
    const run = await startRun(db, org.id, w.id, "manual");
    const r = await runWorkflowJob(db, { runId: run.id, orgId: org.id }, { writer: fake });
    expect(r?.status).toBe("completed");
    const added = await db.select().from(s.ideas).where(eq(s.ideas.title, "Chai vs coffee poll"));
    expect(added[0]).toMatchObject({ source: "ai", spaceId: cafe.id });
    expect(added[0].tags).toContain("workflow");
    const used = await db.select().from(s.usageEvents).where(eq(s.usageEvents.kind, "workflow"));
    expect(used.length).toBeGreaterThan(0);
  });

  it("fails clearly when a workflow needs AI and it isn't set up", async () => {
    const w = await workflow("custom", cafe.id, "What should we post?");
    const run = await startRun(db, org.id, w.id, "manual");
    const r = await runWorkflowJob(db, { runId: run.id, orgId: org.id }, { aiReady: false });
    expect(r?.status).toBe("failed");
    expect(r?.error).toMatch(/ANTHROPIC_API_KEY/);
  });
});
