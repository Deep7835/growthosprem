"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSystemDb, withOrg } from "@/db";
import { createInvites, renewInvite, revokeInvite } from "@/db/invites";
import { removeMember, updateMemberAccess } from "@/db/members";
import { invites, spaceMembers, spaces } from "@/db/schema";
import { inviteEmail } from "@/emails/invite";
import { canInvite, canManageMembers, type InviteRole } from "@/lib/permissions";
import { sendEmail } from "@/server/email";
import { getOrgContext } from "@/server/tenancy";
import { appUrl } from "@/server/url";

const MAX_EMAILS = 20;
const roleSchema = z.enum(["admin", "manager", "editor"]);

export interface SentInvite {
  email: string;
  status: "invited" | "renewed" | "already-member";
  link?: string;
  emailed?: boolean;
  reason?: string;
}
export type InviteState = { results?: SentInvite[]; error?: string } | undefined;

const membersPath = (org: string) => `/o/${org}/settings/members`;

async function deliver(ctx: Awaited<ReturnType<typeof getOrgContext>>, invite: { id: string; email: string; role: InviteRole; spaceIds: string[]; expiresAt: Date }, token: string) {
  const link = `${await appUrl()}/invite/${token}`;
  const spaceNames = invite.spaceIds.length
    ? (await withOrg(ctx.org.id, (tx) => tx.select({ name: spaces.name }).from(spaces).where(inArray(spaces.id, invite.spaceIds)))).map((x) => x.name)
    : [];
  const email = inviteEmail({ inviterName: ctx.user.name, orgName: ctx.org.name, role: invite.role, spaceNames, url: link, expiresAt: invite.expiresAt });
  // One email per link, even if the action is retried.
  const sent = await sendEmail({ to: invite.email, ...email, idempotencyKey: `invite-${createHash("sha256").update(token).digest("hex").slice(0, 32)}` });
  return { link, emailed: sent.sent, reason: sent.sent ? undefined : sent.reason };
}

export async function inviteMembers(org: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await getOrgContext(org);
  const emails = String(formData.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (emails.length === 0) return { error: "Add at least one email address." };
  if (emails.length > MAX_EMAILS) return { error: `Invite up to ${MAX_EMAILS} people at a time.` };
  const bad = emails.filter((e) => !z.email().safeParse(e).success);
  if (bad.length) return { error: `These don’t look like email addresses: ${bad.join(", ")}` };
  const role = roleSchema.safeParse(formData.get("role"));
  if (!role.success) return { error: "Choose a role." };
  const spaceIds = z.array(z.uuid()).max(100).parse(formData.getAll("spaceIds"));

  const mySpaces = await withOrg(ctx.org.id, (tx) =>
    tx.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, ctx.user.id)),
  );
  if (!canInvite(ctx.role, { role: role.data, spaceIds }, mySpaces.map((x) => x.id))) {
    return {
      error:
        role.data !== "admin" && spaceIds.length === 0
          ? "Choose at least one space for Managers and Editors."
          : "Your role can’t send this invite. Managers can invite Managers and Editors to their own spaces.",
    };
  }

  const db = await getSystemDb();
  const created = await createInvites(db, { orgId: ctx.org.id, invitedBy: ctx.user.id, emails, role: role.data, spaceIds });
  const results: SentInvite[] = [];
  for (const r of created) {
    if (r.status === "already-member") {
      results.push({ email: r.email, status: r.status });
      continue;
    }
    const expiresAt = new Date(Date.now() + 7 * 864e5);
    results.push({ email: r.email, status: r.status, ...(await deliver(ctx, { id: r.inviteId, email: r.email, role: role.data, spaceIds, expiresAt }, r.token)) });
  }
  revalidatePath(membersPath(org));
  return { results };
}

async function requireInviteManager(org: string, inviteId: string) {
  const ctx = await getOrgContext(org);
  const [invite] = await withOrg(ctx.org.id, (tx) => tx.select().from(invites).where(and(eq(invites.id, z.uuid().parse(inviteId)))));
  if (!invite) throw new Error("Invite not found.");
  if (!canManageMembers(ctx.role) && invite.invitedBy !== ctx.user.id) throw new Error("Only Owners, Admins or the person who sent it can change this invite.");
  return { ctx, invite };
}

export async function resendInvite(org: string, inviteId: string): Promise<SentInvite> {
  const { ctx, invite } = await requireInviteManager(org, inviteId);
  const renewed = await renewInvite(await getSystemDb(), ctx.org.id, invite.id);
  if (!renewed) throw new Error("This invite was already accepted or revoked.");
  const { role } = renewed.invite;
  if (role === "owner") throw new Error("Ownership can’t be given by invite.");
  const result = await deliver(ctx, { ...renewed.invite, role }, renewed.token);
  revalidatePath(membersPath(org));
  return { email: invite.email, status: "renewed", ...result };
}

export async function revokeInviteAction(org: string, inviteId: string) {
  const { ctx, invite } = await requireInviteManager(org, inviteId);
  await revokeInvite(await getSystemDb(), ctx.org.id, invite.id);
  revalidatePath(membersPath(org));
}

export async function updateAccess(org: string, userId: string, formData: FormData) {
  const ctx = await getOrgContext(org);
  if (!canManageMembers(ctx.role)) throw new Error("Only Owners and Admins can change roles.");
  if (userId === ctx.user.id) throw new Error("You can’t change your own role.");
  await updateMemberAccess(await getSystemDb(), ctx.org.id, {
    userId: z.uuid().parse(userId),
    role: roleSchema.parse(formData.get("role")),
    spaceIds: z.array(z.uuid()).max(100).parse(formData.getAll("spaceIds")),
  });
  revalidatePath(membersPath(org));
}

export async function removeMemberAction(org: string, userId: string) {
  const ctx = await getOrgContext(org);
  if (!canManageMembers(ctx.role)) throw new Error("Only Owners and Admins can remove members.");
  if (userId === ctx.user.id) throw new Error("You can’t remove yourself.");
  await removeMember(await getSystemDb(), ctx.org.id, z.uuid().parse(userId));
  revalidatePath(`/o/${org}`, "layout");
}
