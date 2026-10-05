import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createWorkspace, joinDemoWorkspace, linkIdentity, slugify, userOrgSlugs } from "./accounts";
import { createPgliteDb, withOrg, type Db } from "./core";
import * as s from "./schema";
import { seed } from "./seed";

let db: Db;
beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
}, 30_000);

describe("linkIdentity", () => {
  it("creates a user on first sign-in and finds it again by Clerk id", async () => {
    const a = await linkIdentity(db, { clerkUserId: "user_new", email: "New@Example.com", emailVerified: true, name: "Neha" });
    expect(a.email).toBe("new@example.com");
    const again = await linkIdentity(db, { clerkUserId: "user_new", email: "changed@example.com", emailVerified: true, name: "Neha" });
    expect(again.id).toBe(a.id);
  });

  it("links an existing user by verified email", async () => {
    const u = await linkIdentity(db, { clerkUserId: "user_prem", email: "prem@example.com", emailVerified: true, name: "Prem" });
    const [seeded] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
    expect(u.id).toBe(seeded.id);
    expect(seeded.clerkUserId).toBe("user_prem");
  });

  it("refuses to link by an unverified email or take over a linked account", async () => {
    await expect(linkIdentity(db, { clerkUserId: "user_x", email: "rahul@example.com", emailVerified: false, name: "X" })).rejects.toThrow();
    await expect(linkIdentity(db, { clerkUserId: "user_y", email: "prem@example.com", emailVerified: true, name: "Y" })).rejects.toThrow();
  });
});

describe("createWorkspace", () => {
  it("creates the organisation, Owner membership, first space and statuses", async () => {
    const owner = await linkIdentity(db, { clerkUserId: "user_owner", email: "owner@example.com", emailVerified: true, name: "Owner" });
    const ws = await createWorkspace(db, {
      userId: owner.id,
      accountType: "agency",
      orgName: "Spice Media",
      country: "IN",
      timezone: "Asia/Kolkata",
      spaceName: "Chai Point",
      spaceColor: "#7FC8A9",
      template: "agency",
      now: new Date("2026-10-05T00:00:00Z"),
    });
    expect(ws.orgSlug).toBe("spice-media");
    expect(ws.spaceSlug).toBe("chai-point");
    expect(await userOrgSlugs(db, owner.id)).toEqual(["spice-media"]);

    const { org, statuses, role } = await withOrg(db, ws.orgId, async (tx) => ({
      org: (await tx.select().from(s.organizations))[0],
      statuses: await tx.select().from(s.statuses),
      role: (await tx.select().from(s.memberships))[0].role,
    }));
    expect(role).toBe("owner");
    expect(org.currency).toBe("INR");
    expect(org.trialEndsAt?.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(statuses.map((x) => x.name)).toContain("Client review");
    expect(new Set(statuses.map((x) => x.category))).toEqual(new Set(["not_started", "active", "completed", "closed"]));
  });

  it("gives each organisation a unique address", async () => {
    const u = await linkIdentity(db, { clerkUserId: "user_two", email: "two@example.com", emailVerified: true, name: "Two" });
    const input = { userId: u.id, accountType: "brand" as const, orgName: "Spice Media", country: "US", timezone: "America/New_York", spaceName: "Spice Media", spaceColor: "#F2A93B", template: "simple" as const };
    expect((await createWorkspace(db, input)).orgSlug).toBe("spice-media-2");
    expect((await createWorkspace(db, input)).orgSlug).toBe("spice-media-3");
  });

  it("makes safe slugs", () => {
    expect(slugify("  Café & Co. — Delhi! ")).toBe("cafe-co-delhi");
    expect(slugify("!!!")).toBe("workspace");
  });
});

describe("joinDemoWorkspace", () => {
  it("adds the user to the demo agency as Admin once", async () => {
    const u = await linkIdentity(db, { clerkUserId: "user_demo", email: "demo@example.com", emailVerified: true, name: "Demo" });
    expect(await joinDemoWorkspace(db, u.id)).toBe("knockknockclub");
    expect(await joinDemoWorkspace(db, u.id)).toBe("knockknockclub");
    expect(await userOrgSlugs(db, u.id)).toEqual(["knockknockclub"]);
  });
});
