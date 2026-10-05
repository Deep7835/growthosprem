// Team invites (TM-01, TM-02, flow F5). Free of Next.js imports so they can be tested.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { InviteRole } from "@/lib/permissions";
import { withOrg, type Db } from "./core";
import * as s from "./schema";

export const INVITE_TTL_DAYS = 7;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const expiry = (now: Date) => new Date(now.getTime() + INVITE_TTL_DAYS * 864e5);
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export type InviteResult =
  | { email: string; status: "invited" | "renewed"; inviteId: string; token: string }
  | { email: string; status: "already-member" };

/** Creates invites, or renews a pending invite for the same email with the new role, spaces and link. */
export async function createInvites(
  db: Db,
  input: { orgId: string; invitedBy: string; emails: string[]; role: InviteRole; spaceIds: string[]; now?: Date },
): Promise<InviteResult[]> {
  const now = input.now ?? new Date();
  const emails = [...new Set(input.emails.map(normaliseEmail))];
  const spaceIds = input.role === "admin" ? [] : input.spaceIds;

  return withOrg(db, input.orgId, async (tx) => {
    const members = await tx
      .select({ email: s.users.email })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(inArray(s.users.email, emails));
    const memberEmails = new Set(members.map((m) => m.email));
    const results: InviteResult[] = [];

    for (const email of emails) {
      if (memberEmails.has(email)) {
        results.push({ email, status: "already-member" });
        continue;
      }
      const token = newToken();
      const values = { role: input.role, spaceIds, tokenHash: hashToken(token), invitedBy: input.invitedBy, expiresAt: expiry(now), lastSentAt: now };
      const [pending] = await tx
        .select()
        .from(s.invites)
        .where(and(eq(s.invites.email, email), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)));
      if (pending) {
        await tx.update(s.invites).set(values).where(eq(s.invites.id, pending.id));
        results.push({ email, status: "renewed", inviteId: pending.id, token });
      } else {
        const [row] = await tx.insert(s.invites).values({ orgId: input.orgId, email, ...values }).returning();
        results.push({ email, status: "invited", inviteId: row.id, token });
      }
    }
    return results;
  });
}

/** "Resend": a fresh link and another 7 days. The old link stops working. */
export async function renewInvite(db: Db, orgId: string, inviteId: string, now = new Date()) {
  const token = newToken();
  const [row] = await withOrg(db, orgId, (tx) =>
    tx
      .update(s.invites)
      .set({ tokenHash: hashToken(token), expiresAt: expiry(now), lastSentAt: now })
      .where(and(eq(s.invites.id, inviteId), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)))
      .returning(),
  );
  return row ? { invite: row, token } : null;
}

export async function revokeInvite(db: Db, orgId: string, inviteId: string, now = new Date()) {
  await withOrg(db, orgId, (tx) =>
    tx.update(s.invites).set({ revokedAt: now }).where(and(eq(s.invites.id, inviteId), isNull(s.invites.acceptedAt))),
  );
}

export type InviteLookup = Awaited<ReturnType<typeof findInviteByToken>>;

/** The only cross-tenant read of invites: the accept page finds an invite by its link. */
export async function findInviteByToken(db: Db, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return { state: "missing" as const };
  const [row] = await db
    .select({ invite: s.invites, orgName: s.organizations.name, orgSlug: s.organizations.slug, inviterName: s.users.name })
    .from(s.invites)
    .innerJoin(s.organizations, eq(s.organizations.id, s.invites.orgId))
    .leftJoin(s.users, eq(s.users.id, s.invites.invitedBy))
    .where(eq(s.invites.tokenHash, hashToken(token)));
  if (!row) return { state: "missing" as const };
  const spaceNames = row.invite.spaceIds.length
    ? (await db.select({ name: s.spaces.name }).from(s.spaces).where(inArray(s.spaces.id, row.invite.spaceIds))).map((x) => x.name)
    : [];
  const state = row.invite.revokedAt ? "revoked" : row.invite.acceptedAt ? "accepted" : row.invite.expiresAt <= now ? "expired" : "ok";
  return { state, ...row, spaceNames } as const;
}

/** Pending invites for a signed-in user's email, shown during onboarding. */
export async function pendingInvitesForEmail(db: Db, email: string, now = new Date()) {
  return db
    .select({ id: s.invites.id, orgId: s.invites.orgId, role: s.invites.role, orgName: s.organizations.name })
    .from(s.invites)
    .innerJoin(s.organizations, eq(s.organizations.id, s.invites.orgId))
    .where(
      and(eq(s.invites.email, normaliseEmail(email)), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt), gt(s.invites.expiresAt, now)),
    );
}

/**
 * Accepts an invite for a signed-in user whose email matches it: adds the
 * membership and the invited spaces, then marks the invite accepted.
 */
export async function acceptInvite(db: Db, input: { orgId: string; inviteId: string; user: { id: string; email: string }; now?: Date }) {
  const now = input.now ?? new Date();
  return withOrg(db, input.orgId, async (tx) => {
    const [invite] = await tx.select().from(s.invites).where(eq(s.invites.id, input.inviteId));
    if (!invite || invite.revokedAt) throw new Error("This invite is no longer active.");
    if (invite.acceptedAt) {
      if (invite.acceptedBy === input.user.id) return;
      throw new Error("This invite has already been used.");
    }
    if (invite.expiresAt <= now) throw new Error("This invite has expired. Ask for a new one.");
    if (normaliseEmail(input.user.email) !== invite.email) throw new Error("This invite was sent to a different email address.");

    const [existing] = await tx
      .select()
      .from(s.memberships)
      .where(and(eq(s.memberships.orgId, input.orgId), eq(s.memberships.userId, input.user.id)));
    if (!existing) await tx.insert(s.memberships).values({ orgId: input.orgId, userId: input.user.id, role: invite.role });

    // Only spaces that still exist in this organisation (RLS hides any others).
    const validSpaces = invite.spaceIds.length
      ? await tx.select({ id: s.spaces.id }).from(s.spaces).where(inArray(s.spaces.id, invite.spaceIds))
      : [];
    if (validSpaces.length) {
      await tx
        .insert(s.spaceMembers)
        .values(validSpaces.map((sp) => ({ orgId: input.orgId, spaceId: sp.id, userId: input.user.id })))
        .onConflictDoNothing();
    }
    await tx.update(s.invites).set({ acceptedAt: now, acceptedBy: input.user.id }).where(eq(s.invites.id, invite.id));
  });
}

