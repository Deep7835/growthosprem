"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanPrefs } from "@/lib/notifications";
import { applyToSpaces, resetToDefault, saveDigest, saveTypes, setCleared, setRead } from "@/server/notifications";
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
  revalidatePath(`/o/${org}/notifications/settings`);
}

export async function followDefaults(org: string, spaceId: string) {
  const { ctx } = await scopeFor(org, spaceId);
  await resetToDefault(ctx, spaceId);
  revalidatePath(`/o/${org}/notifications/settings`);
}

export async function applyToOtherSpaces(org: string, spaceId: string) {
  const { ctx, visible } = await scopeFor(org, spaceId);
  await applyToSpaces(ctx, spaceId, visible);
  revalidatePath(`/o/${org}/notifications/settings`);
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
  revalidatePath(`/o/${org}/notifications/settings`);
}
