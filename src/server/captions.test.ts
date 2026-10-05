import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { mergeCaptions, setPlatformCaption, splitCaptions } from "./captions";
import { addPlacement } from "./publishing";
import type { SpaceContext } from "./tenancy";

let db: Db;
let ctx: SpaceContext;
let itemId: string;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [space] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  const [user] = await db.select().from(s.users).where(eq(s.users.email, "rahul@example.com"));
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, space.orgId));
  ctx = { org, space, user, role: "manager", can: () => true } as unknown as SpaceContext;
  const [status] = await db.select().from(s.statuses).where(eq(s.statuses.spaceId, space.id));
  const [item] = await db
    .insert(s.contentItems)
    .values({ orgId: org.id, spaceId: space.id, title: "Chai launch", statusId: status.id, caption: "Masala chai is here" })
    .returning();
  itemId = item.id;
  await db.insert(s.placements).values([
    { orgId: org.id, contentItemId: item.id, kind: "ig_post" },
    { orgId: org.id, contentItemId: item.id, kind: "ig_story" },
    { orgId: org.id, contentItemId: item.id, kind: "fb_post" },
  ]);
}, 60_000);

const overrides = async () =>
  Object.fromEntries((await db.select().from(s.placements).where(eq(s.placements.contentItemId, itemId))).map((p) => [p.kind, p.captionOverride]));

describe("per-platform captions (CT-06)", () => {
  it("splits into one caption per platform, starting from the shared one", async () => {
    await splitCaptions(ctx, itemId);
    expect(await overrides()).toEqual({ ig_post: "Masala chai is here", ig_story: "Masala chai is here", fb_post: "Masala chai is here" });
  });

  it("edits one platform's placements only", async () => {
    await setPlatformCaption(ctx, itemId, "facebook", "Masala chai is here. Come by this evening!");
    const o = await overrides();
    expect(o.fb_post).toBe("Masala chai is here. Come by this evening!");
    expect(o.ig_post).toBe("Masala chai is here");
    await expect(setPlatformCaption(ctx, itemId, "linkedin", "x")).rejects.toThrow(/LinkedIn/);
  });

  it("gives a new placement its platform's caption", async () => {
    await addPlacement(ctx, itemId, "fb_reel");
    expect((await overrides()).fb_reel).toBe("Masala chai is here. Come by this evening!");
  });

  it("goes back to one caption, keeping the chosen platform's text", async () => {
    await mergeCaptions(ctx, itemId, "facebook");
    expect(Object.values(await overrides()).every((v) => v === null)).toBe(true);
    const [item] = await db.select().from(s.contentItems).where(eq(s.contentItems.id, itemId));
    expect(item.caption).toBe("Masala chai is here. Come by this evening!");
  });
});
