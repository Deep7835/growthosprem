import { and, desc, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { seedDemoHistoryIfMissing } from "@/db/seed-history";
import { runTagJob, scheduleTagging, tagSpacePosts, TAG_JOB, type Tagger } from "./tagging";

let db: Db;
let spaceId: string;
let orgId: string;
const calls: number[] = [];

// The model is faked: every post gets the same topic, a hook, and (when asked) a pillar.
const fake: Tagger = async (input) => {
  calls.push(input.posts.length);
  return {
    tags: input.posts.map((p, i) => ({ id: p.id, pillar: "Offers", topic: "Diwali sweets box", hookType: i % 2 ? "Question" : "None" })),
    usage: { input_tokens: 3000, output_tokens: 800 },
    model: "claude-sonnet-5-5",
  };
};

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  await seedDemoHistoryIfMissing(db);
  const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  spaceId = cafe.id;
  orgId = cafe.orgId;
}, 60_000);

const waiting = () => db.select({ id: s.posts.id }).from(s.posts).where(and(eq(s.posts.spaceId, spaceId), isNull(s.posts.taggedAt)));

describe("AI tagging (PRD 9)", () => {
  it("only runs when AI is set up, once per space every 10 minutes", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(await scheduleTagging(db)).toBe(0);
    process.env.ANTHROPIC_API_KEY = "test";
    const now = new Date("2026-10-06T10:00:00Z");
    expect(await scheduleTagging(db, now)).toBeGreaterThanOrEqual(1);
    expect(await scheduleTagging(db, now)).toBe(0);
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("tags 25 posts at a time, filling blanks only, and records the usage", async () => {
    const before = (await waiting()).length;
    expect(before).toBeGreaterThan(25);
    // The newest post is in the first batch.
    const [withPillar] = await db.select().from(s.posts).where(and(eq(s.posts.spaceId, spaceId), isNull(s.posts.taggedAt))).orderBy(desc(s.posts.publishedAt)).limit(1);
    const r = await tagSpacePosts(db, spaceId, { tagger: fake });
    expect(r).toMatchObject({ tagged: 25, more: true });
    expect((await waiting()).length).toBe(before - 25);
    const [after] = await db.select().from(s.posts).where(eq(s.posts.id, withPillar.id));
    // The sample history already has pillars, so the AI's "Offers" doesn't replace them.
    expect(after.pillar).toBe(withPillar.pillar ?? "Offers");
    expect(after.topic).toBe("Diwali sweets box");
    expect(after.tagSource).toBe("ai");
    const hooks = await db.select({ h: s.posts.hookType }).from(s.posts).where(and(eq(s.posts.spaceId, spaceId), eq(s.posts.tagSource, "ai")));
    expect(new Set(hooks.map((x) => x.h))).toEqual(new Set(["Question", null]));
    const [usage] = await db.select().from(s.usageEvents).where(eq(s.usageEvents.kind, "tagging"));
    expect(usage).toMatchObject({ userId: null, spaceId, credits: 2 });
  });

  it("queues the next batch while posts are waiting, and never re-tags hand-set tags", async () => {
    const [p] = await waiting();
    await db.update(s.posts).set({ topic: "Mine", tagSource: "manual", taggedAt: new Date() }).where(eq(s.posts.id, p.id));
    const left = (await waiting()).length;
    const r = await runTagJob(db, { spaceId }, { tagger: fake });
    expect(r.tagged).toBe(Math.min(25, left));
    const queued = await db.select().from(s.jobs).where(and(eq(s.jobs.kind, TAG_JOB), isNull(s.jobs.dedupeKey)));
    expect(queued.length).toBe(left > 25 ? 1 : 0);
    const [mine] = await db.select().from(s.posts).where(eq(s.posts.id, p.id));
    expect(mine.topic).toBe("Mine");
  });

  it("skips when the AI budget is used up or the organisation is read-only", async () => {
    await db.update(s.organizations).set({ aiMonthlyCredits: 1 }).where(eq(s.organizations.id, orgId));
    expect(await tagSpacePosts(db, spaceId, { tagger: fake })).toMatchObject({ tagged: 0, skipped: "budget" });
    await db.update(s.organizations).set({ aiMonthlyCredits: 1000, trialEndsAt: new Date(Date.now() - 864e5) }).where(eq(s.organizations.id, orgId));
    expect(await tagSpacePosts(db, spaceId, { tagger: fake })).toMatchObject({ tagged: 0, skipped: "locked" });
  });
});
