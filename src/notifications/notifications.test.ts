import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, withOrg, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { NOTIFY_JOB, scheduleDigests, sendPendingEmails, sweepTasks } from "./worker";
import { deliver } from "./deliver";
import { mentionedIn } from "./content";

let db: Db;
let orgId: string;
let spaceId: string;
let people: Record<"prem" | "rahul" | "riya", string>;

beforeAll(async () => {
  delete process.env.RESEND_API_KEY;
  db = await createPgliteDb();
  await seed(db);
  const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  orgId = cafe.orgId;
  spaceId = cafe.id;
  const users = await db.select().from(s.users);
  const id = (email: string) => users.find((u) => u.email === email)!.id;
  people = { prem: id("prem@example.com"), rahul: id("rahul@example.com"), riya: id("riya@example.com") };
  await db.delete(s.notifications);
}, 60_000);

const rowsFor = (userId: string, kind: string) =>
  db.select().from(s.notifications).where(and(eq(s.notifications.userId, userId), eq(s.notifications.kind, kind)));

describe("deliver", () => {
  it("follows each person's channels: the space's setting over their default", async () => {
    await db.insert(s.notificationSettings).values([
      { orgId, userId: people.rahul, scope: "default", settings: { types: { publishing: { inApp: false, email: true } } } },
      { orgId, userId: people.riya, scope: "default", settings: { types: { publishing: { inApp: false, email: true } } } },
      { orgId, userId: people.riya, scope: spaceId, settings: { types: { publishing: { inApp: false, email: false } } } },
    ]);
    const sent = await withOrg(db, orgId, (tx) =>
      deliver(tx, [people.prem, people.rahul, people.riya, people.prem], { orgId, spaceId, kind: "published", title: "Published: Monsoon menu" }),
    );
    expect(sent).toBe(2);
    const [prem] = await rowsFor(people.prem, "published");
    expect(prem).toMatchObject({ inApp: true, emailStatus: null });
    const [rahul] = await rowsFor(people.rahul, "published");
    expect(rahul).toMatchObject({ inApp: false, emailStatus: "pending" });
    expect(await rowsFor(people.riya, "published")).toHaveLength(0);
  });

  it("notifies once per key and can skip the immediate email", async () => {
    const event = { orgId, spaceId, kind: "publish_failed", title: "Instagram Post failed", key: "once", noEmail: true };
    await withOrg(db, orgId, (tx) => deliver(tx, [people.prem], event));
    await withOrg(db, orgId, (tx) => deliver(tx, [people.prem], event));
    const rows = await rowsFor(people.prem, "publish_failed");
    expect(rows).toHaveLength(1);
    expect(rows[0].emailStatus).toBeNull();
  });

  it("marks queued emails skipped when email isn't set up", async () => {
    await sendPendingEmails(db);
    const [rahul] = await rowsFor(people.rahul, "published");
    expect(rahul.emailStatus).toBe("skipped");
  });
});

describe("tasks (TK-03)", () => {
  it("tells the assignee once when a task is due soon and once when it's overdue", async () => {
    const now = new Date("2026-10-05T06:00:00Z");
    const [task] = await db
      .insert(s.tasks)
      .values({ orgId, spaceId, title: "Shoot the Diwali reel", assigneeId: people.riya, dueAt: new Date("2026-10-05T20:00:00Z") })
      .returning();
    await sweepTasks(db, now);
    await sweepTasks(db, now);
    expect(await rowsFor(people.riya, "task_due")).toHaveLength(1);
    await sweepTasks(db, new Date("2026-10-05T21:00:00Z"));
    const overdue = await rowsFor(people.riya, "task_overdue");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].title).toBe("Overdue: Shoot the Diwali reel");
    await db.update(s.tasks).set({ done: true }).where(eq(s.tasks.id, task.id));
  });
});

describe("digest (NT-04)", () => {
  it("queues one digest at 9 AM in the person's time zone", async () => {
    await db
      .insert(s.notificationSettings)
      .values({ orgId, userId: people.prem, scope: "default", settings: { digest: true, timeZone: "Asia/Kolkata" } });
    expect(await scheduleDigests(db, new Date("2026-10-05T02:00:00Z"))).toBe(0);
    expect(await scheduleDigests(db, new Date("2026-10-05T03:30:00Z"))).toBe(1);
    expect(await scheduleDigests(db, new Date("2026-10-05T03:45:00Z"))).toBe(0);
    const jobs = await db.select().from(s.jobs).where(eq(s.jobs.kind, NOTIFY_JOB.digest));
    expect(jobs[0].payload).toEqual({ orgId, userId: people.prem, date: "2026-10-05" });
  });
});

describe("@mentions in comments", () => {
  const team = [
    { id: "1", name: "Priya Sharma" },
    { id: "2", name: "Priya Nair" },
    { id: "3", name: "Rahul" },
  ];
  it("finds full names, and first names only when they're unique", () => {
    expect(mentionedIn("@rahul can you check? cc @Priya Nair", team).sort()).toEqual(["2", "3"]);
    expect(mentionedIn("@Priya please look", team)).toEqual([]);
    expect(mentionedIn("email rahul@example.com", team)).toEqual([]);
  });
});
