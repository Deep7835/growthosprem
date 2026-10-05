"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withOrg } from "@/db";
import { approvals, comments, contentItems, shareLinkItems, statuses } from "@/db/schema";
import { logActivity } from "@/server/activity";
import { deliver, spaceManagers } from "@/notifications/deliver";
import { postFollowers, postHref } from "@/notifications/content";
import { currentVersionHash, resolveShareLink } from "@/server/review";
import { REVIEWER_COOKIE, readReviewer, reviewerSchema } from "@/server/reviewer";

/** The client enters their name once; no account needed (SH-04). */
export async function setReviewer(token: string, formData: FormData) {
  const reviewer = reviewerSchema.parse({ name: formData.get("name"), email: formData.get("email") ?? "" });
  (await cookies()).set(REVIEWER_COOKIE, JSON.stringify(reviewer), {
    httpOnly: true,
    sameSite: "lax",
    path: "/review",
    maxAge: 60 * 60 * 24 * 90,
  });
  revalidatePath(`/review/${token}`);
  redirect(`/review/${token}`);
}

export async function decide(token: string, contentId: string, decision: "approved" | "changes_requested", formData: FormData) {
  z.enum(["approved", "changes_requested"]).parse(decision);
  const reviewer = await readReviewer();
  if (!reviewer) throw new Error("Please enter your name first.");
  const link = await resolveShareLink(token);
  if (link.state !== "ok") throw new Error("This review link is no longer active.");
  if (link.link.permission !== "approve") throw new Error("This link does not allow approvals.");
  const note = z.string().trim().max(2000).parse(formData.get("note") ?? "");
  if (decision === "changes_requested" && !note) throw new Error("Please say what should change.");

  const { orgId, spaceId, id: shareLinkId } = link.link;
  await withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({ item: contentItems })
      .from(shareLinkItems)
      .innerJoin(contentItems, eq(contentItems.id, shareLinkItems.contentItemId))
      .where(and(eq(shareLinkItems.shareLinkId, shareLinkId), eq(shareLinkItems.contentItemId, z.uuid().parse(contentId))));
    if (!row) throw new Error("This post is not part of the review link.");
    const { item } = row;

    await tx.insert(approvals).values({
      orgId,
      shareLinkId,
      contentItemId: item.id,
      decision,
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email || null,
      note: note || null,
      versionHash: await currentVersionHash(tx, item),
    });

    // Move the item to the space's mapped status (SH-06).
    const [target] = await tx
      .select()
      .from(statuses)
      .where(and(eq(statuses.spaceId, spaceId), eq(statuses.reviewRole, decision)));
    if (target && target.id !== item.statusId) {
      await tx.update(contentItems).set({ statusId: target.id, updatedAt: new Date() }).where(eq(contentItems.id, item.id));
    }
    if (note) {
      await tx.insert(comments).values({
        orgId,
        contentItemId: item.id,
        authorReviewerName: reviewer.name,
        visibility: "public",
        body: note,
      });
    }
    await logActivity(tx, {
      orgId,
      spaceId,
      contentItemId: item.id,
      actor: { kind: "reviewer", name: reviewer.name },
      action: decision === "approved" ? "approved" : "requested changes",
      field: target ? "status" : undefined,
      after: target?.name,
    });
    // The post's people and the space's Managers; Owners and Admins only if nobody else would hear.
    const people = [...(await postFollowers(tx, item.id)), ...(await spaceManagers(tx, spaceId, { admins: false }))];
    await deliver(tx, people.length ? people : await spaceManagers(tx, spaceId), {
      orgId,
      spaceId,
      kind: decision === "approved" ? "review_approved" : "review_changes",
      title: decision === "approved" ? `${reviewer.name} approved “${item.title}”` : `${reviewer.name} asked for changes to “${item.title}”`,
      body: note,
      href: await postHref(tx, item),
    });
  });
  revalidatePath(`/review/${token}`);
  redirect(`/review/${token}`);
}
