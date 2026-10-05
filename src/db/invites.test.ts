import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { canInvite } from "@/lib/permissions";
import { linkIdentity } from "./accounts";
import { createPgliteDb, withOrg, type Db } from "./core";
import { acceptInvite, createInvites, findInviteByToken, pendingInvitesForEmail, renewInvite, revokeInvite } from "./invites";
import { listMembers, removeMember, updateMemberAccess } from "./members";
import * as s from "./schema";
import { seed } from "./seed";

let db: Db;
let orgId: string;
let prem: string;
let cafe: string;
let realEstate: string;
const NOW = new Date("2026-10-05T06:00:00Z");

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  orgId = (await db.select().from(s.organizations))[0].id;
  prem = (await db.select().from(s.users).where(eq(s.users.email, "prem@example.com")))[0].id;
  const spaces = await db.select().from(s.spaces);
  cafe = spaces.find((x) => x.slug === "cafe")!.id;
  realEstate = spaces.find((x) => x.slug === "real-estate")!.id;
}, 30_000);

describe("invite permissions", () => {
  it("lets Managers invite Editors only to their own spaces", () => {
    expect(canInvite("manager", { role: "editor", spaceIds: ["a"] }, ["a", "b"])).toBe(true);
    expect(canInvite("manager", { role: "editor", spaceIds: ["c"] }, ["a"])).toBe(false);
    expect(canInvite("manager", { role: "admin", spaceIds: [] }, ["a"])).toBe(false);
    expect(canInvite("editor", { role: "editor", spaceIds: ["a"] }, ["a"])).toBe(false);
  });
  it("requires a space for Managers and Editors", () => {
    expect(canInvite("owner", { role: "editor", spaceIds: [] }, [])).toBe(false);
    expect(canInvite("owner", { role: "admin", spaceIds: [] }, [])).toBe(true);
  });
});

describe("invites", () => {
  it("invites new people, skips members and renews a pending invite", async () => {
    const first = await createInvites(db, { orgId, invitedBy: prem, emails: ["Anil@Example.com", "riya@example.com"], role: "editor", spaceIds: [cafe], now: NOW });
    expect(first.map((r) => r.status)).toEqual(["invited", "already-member"]);
    const again = await createInvites(db, { orgId, invitedBy: prem, emails: ["anil@example.com"], role: "manager", spaceIds: [cafe, realEstate], now: NOW });
    expect(again[0].status).toBe("renewed");
    // The old link stops working when the invite is renewed.
    const oldToken = (first[0] as { token: string }).token;
    expect((await findInviteByToken(db, oldToken, NOW)).state).toBe("missing");
    const found = await findInviteByToken(db, (again[0] as { token: string }).token, NOW);
    expect(found.state).toBe("ok");
    if (found.state === "ok") {
      expect(found.invite.role).toBe("manager");
      expect(found.spaceNames.sort()).toEqual(["Cafe", "Real estate"]);
      expect(found.orgName).toBe("KnockKnockClub");
    }
  });

  it("stores only a hash of the link", async () => {
    const [r] = await createInvites(db, { orgId, invitedBy: prem, emails: ["hash@example.com"], role: "admin", spaceIds: [cafe], now: NOW });
    const token = (r as { token: string }).token;
    const rows = await withOrg(db, orgId, (tx) => tx.select().from(s.invites).where(eq(s.invites.email, "hash@example.com")));
    expect(rows[0].tokenHash).not.toContain(token);
    expect(rows[0].spaceIds).toEqual([]); // Admins see every space
  });

  it("expires after 7 days and can be renewed or revoked", async () => {
    const [r] = await createInvites(db, { orgId, invitedBy: prem, emails: ["late@example.com"], role: "editor", spaceIds: [cafe], now: NOW });
    const later = new Date(NOW.getTime() + 8 * 864e5);
    expect((await findInviteByToken(db, (r as { token: string }).token, later)).state).toBe("expired");
    const renewed = await renewInvite(db, orgId, (r as { inviteId: string }).inviteId, later);
    expect((await findInviteByToken(db, renewed!.token, later)).state).toBe("ok");
    await revokeInvite(db, orgId, (r as { inviteId: string }).inviteId, later);
    expect((await findInviteByToken(db, renewed!.token, later)).state).toBe("revoked");
  });

  it("accepts only for the invited email, then adds the membership and spaces", async () => {
    const [r] = await createInvites(db, { orgId, invitedBy: prem, emails: ["neel@example.com"], role: "editor", spaceIds: [realEstate], now: NOW });
    const inviteId = (r as { inviteId: string }).inviteId;
    const stranger = await linkIdentity(db, { clerkUserId: "user_stranger", email: "stranger@example.com", emailVerified: true, name: "Stranger" });
    await expect(acceptInvite(db, { orgId, inviteId, user: stranger, now: NOW })).rejects.toThrow(/different email/);

    const neel = await linkIdentity(db, { clerkUserId: "user_neel", email: "neel@example.com", emailVerified: true, name: "Neel" });
    expect((await pendingInvitesForEmail(db, "NEEL@example.com", NOW)).map((p) => p.orgName)).toEqual(["KnockKnockClub"]);
    await acceptInvite(db, { orgId, inviteId, user: neel, now: NOW });
    const members = await listMembers(db, orgId);
    const added = members.find((m) => m.email === "neel@example.com")!;
    expect(added.role).toBe("editor");
    expect(added.spaceIds).toEqual([realEstate]);
    expect(await pendingInvitesForEmail(db, "neel@example.com", NOW)).toEqual([]);
    // Accepting twice is harmless for the same person.
    await acceptInvite(db, { orgId, inviteId, user: neel, now: NOW });
  });
});

describe("members", () => {
  it("changes a member's role and spaces, but never the Owner's", async () => {
    const rahul = (await listMembers(db, orgId)).find((m) => m.email === "rahul@example.com")!;
    await updateMemberAccess(db, orgId, { userId: rahul.userId, role: "editor", spaceIds: [cafe] });
    const after = (await listMembers(db, orgId)).find((m) => m.email === "rahul@example.com")!;
    expect(after.role).toBe("editor");
    expect(after.spaceIds).toEqual([cafe]);
    await expect(updateMemberAccess(db, orgId, { userId: prem, role: "editor", spaceIds: [cafe] })).rejects.toThrow(/Owner/);
  });

  it("removes a member and unassigns their open work", async () => {
    const riya = (await listMembers(db, orgId)).find((m) => m.email === "riya@example.com")!;
    expect(riya.openPosts).toBeGreaterThan(0);
    const result = await removeMember(db, orgId, riya.userId);
    expect(result.posts).toBeGreaterThan(0);
    expect((await listMembers(db, orgId)).some((m) => m.email === "riya@example.com")).toBe(false);
    await expect(removeMember(db, orgId, prem)).rejects.toThrow(/Owner/);
  });
});
