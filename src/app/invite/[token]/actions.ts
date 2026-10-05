"use server";

import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSystemDb } from "@/db";
import { acceptInvite, findInviteByToken, pendingInvitesForEmail } from "@/db/invites";
import { authMode, getSessionUser } from "@/server/session";

/** With Clerk, the email must be verified there before it can claim an invite. */
async function verifiedEmailUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (authMode() === "clerk") {
    const clerkUser = await currentUser();
    const verified = clerkUser?.emailAddresses.some(
      (e) => e.emailAddress.toLowerCase() === user.email && e.verification?.status === "verified",
    );
    if (!verified) throw new Error("Verify your email address first, then accept the invite.");
  }
  return user;
}

export async function acceptInviteByToken(token: string) {
  const user = await verifiedEmailUser();
  const db = await getSystemDb();
  const found = await findInviteByToken(db, token);
  if (found.state !== "ok") throw new Error("This invite is no longer active.");
  await acceptInvite(db, { orgId: found.invite.orgId, inviteId: found.invite.id, user });
  redirect(`/o/${found.orgSlug}/overview`);
}

/** From onboarding: accept an invite sent to the signed-in user's own email. */
export async function acceptInviteForMe(inviteId: string) {
  const user = await verifiedEmailUser();
  const db = await getSystemDb();
  const mine = (await pendingInvitesForEmail(db, user.email)).find((i) => i.id === z.uuid().parse(inviteId));
  if (!mine) throw new Error("This invite is no longer available.");
  await acceptInvite(db, { orgId: mine.orgId, inviteId: mine.id, user });
  redirect("/");
}
