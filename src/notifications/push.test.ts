import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPgliteDb, withOrg, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";

// The push service is mocked: one browser accepts, one has gone away (410).
const sent: { endpoint: string; payload: string }[] = [];
vi.mock("web-push", async (load) => {
  const real = await load<{ default: Record<string, unknown>; WebPushError: typeof import("web-push").WebPushError }>();
  return {
    ...real,
    default: {
      ...real.default,
      sendNotification: async (sub: { endpoint: string }, payload: string) => {
        if (sub.endpoint.includes("gone")) throw new real.WebPushError("Gone", 410, {}, "", sub.endpoint);
        sent.push({ endpoint: sub.endpoint, payload });
        return { statusCode: 201, body: "", headers: {} };
      },
    },
  };
});

let db: Db;
let orgId: string;
let spaceId: string;
let riya: string;

beforeAll(async () => {
  const webpush = (await import("web-push")).default;
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  db = await createPgliteDb();
  await seed(db);
  const [cafe] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  orgId = cafe.orgId;
  spaceId = cafe.id;
  [{ id: riya }] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, "riya@example.com"));
  await db.insert(s.pushSubscriptions).values([
    { userId: riya, endpoint: "https://push.example.com/ok", p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
    { userId: riya, endpoint: "https://push.example.com/gone", p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
  ]);
}, 60_000);

describe("browser push (NT-03)", () => {
  it("queues push for types that want it and sends it to each browser", async () => {
    const { deliver } = await import("./deliver");
    const { sendPendingPushes } = await import("./push");
    await withOrg(db, orgId, (tx) => deliver(tx, [riya], { orgId, spaceId, kind: "task_assigned", title: "Prem assigned you “Edit”", href: "/o/x/s/cafe/board?task=1" }));
    await withOrg(db, orgId, (tx) => deliver(tx, [riya], { orgId, spaceId, kind: "published", title: "Published: Weekend brunch" }));
    expect(await sendPendingPushes(db)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].payload)).toMatchObject({ title: "Prem assigned you “Edit”", url: "/o/x/s/cafe/board?task=1" });
    const subs = await db.select().from(s.pushSubscriptions);
    expect(subs.map((x) => x.endpoint)).toEqual(["https://push.example.com/ok"]);
    const rows = await db.select().from(s.notifications).where(eq(s.notifications.userId, riya));
    expect(rows.find((r) => r.kind === "task_assigned")?.pushStatus).toBe("sent");
    expect(rows.find((r) => r.kind === "published")?.pushStatus).toBeNull();
  });
});
