import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { addTag, deleteTag, getBranding, listTags, renameOrg, renameTag, saveBranding, setDisplayName } from "./org-settings";
import type { OrgContext } from "./tenancy";

let db: Db;
let owner: OrgContext;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [org] = await db.select().from(s.organizations);
  const [user] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
  owner = { org, user, role: "owner", requestTime: Date.now(), billing: { phase: "trial", plan: "growth", locked: false } } as unknown as OrgContext;
}, 60_000);

describe("organisation settings", () => {
  it("renames the organisation and you; Managers can't change organisation settings", async () => {
    await renameOrg(owner, "KnockKnock Studio");
    await setDisplayName(owner, "Prem M");
    const [org] = await db.select().from(s.organizations);
    const [me] = await db.select().from(s.users).where(eq(s.users.id, owner.user.id));
    expect([org.name, me.name]).toEqual(["KnockKnock Studio", "Prem M"]);
    await expect(renameOrg({ ...owner, role: "manager" } as OrgContext, "Nope")).rejects.toThrow(/Only Owners and Admins/);
    await expect(renameOrg({ ...owner, billing: { ...owner.billing, locked: true } } as OrgContext, "Nope")).rejects.toThrow(/read-only/);
  });

  it("saves branding", async () => {
    await saveBranding(owner, { primary: "#123456", secondary: "#abcdef", logoData: null, enabled: false });
    expect(await getBranding(owner)).toEqual({ primary: "#123456", secondary: "#abcdef", logoData: null, enabled: false });
  });

  it("lists tags from the list and from posts, and renames or deletes them on every post", async () => {
    const posts = await db.select().from(s.contentItems).limit(3);
    await db.update(s.contentItems).set({ tags: ["diwali", "offer"] }).where(eq(s.contentItems.id, posts[0].id));
    await db.update(s.contentItems).set({ tags: ["diwali", "festive"] }).where(eq(s.contentItems.id, posts[1].id));
    await addTag(owner, "festive");
    await addTag(owner, "launch");
    await addTag(owner, "launch"); // already there: no error, no duplicate

    expect(await listTags(owner)).toEqual([
      { name: "diwali", uses: 2, listed: false },
      { name: "festive", uses: 1, listed: true },
      { name: "launch", uses: 0, listed: true },
      { name: "offer", uses: 1, listed: false },
    ]);

    // Renaming onto a tag a post already has leaves it once.
    await renameTag(owner, "diwali", "festive");
    const tagsOf = async (id: string) => (await db.select({ tags: s.contentItems.tags }).from(s.contentItems).where(eq(s.contentItems.id, id)))[0].tags.sort();
    expect(await tagsOf(posts[0].id)).toEqual(["festive", "offer"]);
    expect(await tagsOf(posts[1].id)).toEqual(["festive"]);

    await deleteTag(owner, "festive");
    expect(await tagsOf(posts[0].id)).toEqual(["offer"]);
    expect((await listTags(owner)).map((t) => t.name)).toEqual(["launch", "offer"]);
  });
});
