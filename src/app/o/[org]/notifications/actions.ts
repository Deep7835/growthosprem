"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSystemDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { cleanPrefs } from "@/lib/notifications";
import { pushTo } from "@/notifications/push";
import { applyToSpaces, deleteCleared, resetToDefault, saveDigest, saveTypes, setCleared, setRead } from "@/server/notifications";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";

const ids = z.union([z.literal("all"), z.array(z.uuid()).min(1).max(500)]);
const done = (org: string) => revalidatePath(`/o/${org}`, "layout");

/** Marks one notification, or all of the person's, as read (the bell). */
export async function markRead(org: string, id?: string) {
  const ctx = await getOrgContext(org);
  await setRead(ctx, id ? [z.uuid().parse(id)] : "all", true);
  done(org);
}

export async function setReadState(org: string, which: string[] | "all", read: boolean) {
  const ctx = await getOrgContext(org);
  await setRead(ctx, ids.parse(which), z.boolean().parse(read));
  done(org);
}

/** Clear (to the Cleared tab) or restore. */
export async function setClearedState(org: string, which: string[] | "all", cleared: boolean) {
  const ctx = await getOrgContext(org);
  await setCleared(ctx, ids.parse(which), z.boolean().parse(cleared));
  done(org);
}

/** Cleared tab › Delete all (for good). */
export async function deleteClearedNotifications(org: string) {
  await deleteCleared(await getOrgContext(org));
  done(org);
}

/** A scope is "default" or the id of a space the person can see. */
async function scopeFor(org: string, scope: string) {
  const ctx = await getOrgContext(org);
  const visible = (await listVisibleSpaces(org)).map((s) => s.id);
  if (scope !== "default" && !visible.includes(z.uuid().parse(scope))) throw new Error("You’re not in that space.");
  return { ctx, visible };
}

export async function savePreferences(org: string, scope: string, types: unknown) {
  const { ctx } = await scopeFor(org, scope);
  await saveTypes(ctx, scope, cleanPrefs(types));
  revalidatePath(`/o/${org}/settings/notifications`);
}

export async function followDefaults(org: string, spaceId: string) {
  const { ctx } = await scopeFor(org, spaceId);
  await resetToDefault(ctx, spaceId);
  revalidatePath(`/o/${org}/settings/notifications`);
}

export async function applyToOtherSpaces(org: string, spaceId: string) {
  const { ctx, visible } = await scopeFor(org, spaceId);
  await applyToSpaces(ctx, spaceId, visible);
  revalidatePath(`/o/${org}/settings/notifications`);
}

export async function setDigest(org: string, on: boolean, timeZone: string) {
  const ctx = await getOrgContext(org);
  let zone = z.string().max(64).parse(timeZone);
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    zone = "Asia/Kolkata";
  }
  await saveDigest(ctx, z.boolean().parse(on), zone);
  revalidatePath(`/o/${org}/settings/notifications`);
}

/* ---------- Browser push (NT-03) ---------- */

const subscription = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints are https."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

/** Saves this browser's subscription for the signed-in person (a browser belongs to one person at a time). */
export async function savePushSubscription(org: string, input: unknown, userAgent: string) {
  const ctx = await getOrgContext(org);
  const sub = subscription.parse(input);
  const db = await getSystemDb();
  await db
    .insert(pushSubscriptions)
    .values({ userId: ctx.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200) })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: ctx.user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200) } });
}

export async function removePushSubscription(org: string, endpoint: string) {
  const ctx = await getOrgContext(org);
  const db = await getSystemDb();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, ctx.user.id), eq(pushSubscriptions.endpoint, z.string().max(1000).parse(endpoint))));
}

/** Sends a test notification to this browser. Returns false if it couldn't be delivered. */
export async function sendTestPush(org: string, endpoint: string): Promise<boolean> {
  const ctx = await getOrgContext(org);
  const db = await getSystemDb();
  const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, ctx.user.id), eq(pushSubscriptions.endpoint, z.string().max(1000).parse(endpoint))));
  const sent = await pushTo(db, subs, { title: "Browser notifications are on", body: "This is how Plotline will tell you when something needs you.", url: `/o/${org}/notifications`, tag: "test" });
  return sent > 0;
}
