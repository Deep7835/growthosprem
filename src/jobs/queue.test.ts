import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, withOrg, type Db } from "@/db/core";
import { jobs, organizations } from "@/db/schema";
import { claim, complete, enqueue, fail, PermanentError, retryDelayMs } from "./queue";

let db: Db;

beforeEach(async () => {
  db = await createPgliteDb();
});

describe("job queue", () => {
  it("skips jobs whose dedupe key exists", async () => {
    expect(await enqueue(db, { kind: "a", payload: {}, dedupeKey: "k" })).toBe(1);
    expect(await enqueue(db, [{ kind: "a", payload: {}, dedupeKey: "k" }, { kind: "b", payload: {} }])).toBe(1);
  });

  it("runs the most urgent due job first and ignores future ones", async () => {
    await enqueue(db, [
      { kind: "sync", payload: {}, priority: 5 },
      { kind: "publish", payload: {}, priority: 0 },
      { kind: "later", payload: {}, priority: 0, runAt: new Date(Date.now() + 60_000) },
    ]);
    expect((await claim(db, "w"))?.kind).toBe("publish");
    expect((await claim(db, "w"))?.kind).toBe("sync");
    expect(await claim(db, "w")).toBeNull();
  });

  it("runs one job per account at a time", async () => {
    await enqueue(db, [
      { kind: "import", payload: { accountId: "a1" } },
      { kind: "sync", payload: { accountId: "a1" } },
      { kind: "sync", payload: { accountId: "a2" } },
    ]);
    const first = await claim(db, "w");
    const second = await claim(db, "w");
    expect([first?.payload, second?.payload]).toEqual([{ accountId: "a1" }, { accountId: "a2" }]);
    expect(await claim(db, "w")).toBeNull();
    await complete(db, first!);
    expect((await claim(db, "w"))?.kind).toBe("sync");
  });

  it("retries with backoff, then gives up", async () => {
    await enqueue(db, { kind: "x", payload: {}, maxAttempts: 2 });
    const now = new Date();
    const job = (await claim(db, "w", now))!;
    expect(await fail(db, job, new Error("timeout"), now)).toBe(false);
    expect(await claim(db, "w", now)).toBeNull();
    const later = new Date(now.getTime() + retryDelayMs(1) + 1);
    const again = (await claim(db, "w", later))!;
    expect(again.attempts).toBe(2);
    expect(await fail(db, again, new Error("timeout"), later)).toBe(true);
    const [row] = await db.select().from(jobs);
    expect(row.failedAt).not.toBeNull();
    expect(row.lastError).toBe("timeout");
  });

  it("does not retry permanent errors", async () => {
    await enqueue(db, { kind: "x", payload: {} });
    const job = (await claim(db, "w"))!;
    expect(await fail(db, job, new PermanentError("token revoked"))).toBe(true);
  });

  it("picks up a job left locked by a crashed worker", async () => {
    await enqueue(db, { kind: "x", payload: {} });
    const t0 = new Date();
    await claim(db, "dead", t0);
    expect(await claim(db, "w", new Date(t0.getTime() + 60_000))).toBeNull();
    expect((await claim(db, "w", new Date(t0.getTime() + 11 * 60_000)))?.lockedBy).toBe("w");
  });

  it("is not readable from tenant-scoped connections", async () => {
    const [org] = await db.insert(organizations).values({ slug: "o", name: "O" }).returning();
    await expect(withOrg(db, org.id, (tx) => tx.execute(sql`select * from jobs`))).rejects.toThrow();
  });
});
