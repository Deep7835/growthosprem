"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connectAccounts, disconnectAccount, requestSync } from "@/server/meta";
import { requireSpaceAction } from "@/server/tenancy";

const page = (org: string, space: string) => `/o/${org}/s/${space}/settings/accounts`;

export async function connectSelected(org: string, space: string, sessionId: string, _state: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const ctx = await requireSpaceAction(org, space, "accounts.connect");
  const keys = form.getAll("account").filter((k): k is string => typeof k === "string");
  try {
    await connectAccounts(ctx, sessionId, keys);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn’t connect those accounts." };
  }
  revalidatePath(`/o/${org}/s/${space}`, "layout");
  redirect(`${page(org, space)}?connected=1`);
}

export async function disconnect(org: string, space: string, accountId: string) {
  const ctx = await requireSpaceAction(org, space, "accounts.connect");
  await disconnectAccount(ctx, accountId);
  revalidatePath(`/o/${org}/s/${space}`, "layout");
}

export async function syncNow(org: string, space: string, accountId: string) {
  const ctx = await requireSpaceAction(org, space, "analytics.view");
  const queued = await requestSync(ctx, accountId);
  revalidatePath(page(org, space));
  return { message: queued ? "Sync started. New numbers appear in a minute." : "This account synced in the last 15 minutes. Try again shortly." };
}
