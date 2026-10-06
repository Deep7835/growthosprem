"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createFeed, removeFeed, setFeedTasks } from "@/server/calendar-feed";
import { getOrgContext } from "@/server/tenancy";
import { appUrl } from "@/server/url";

const page = (org: string) => `/o/${org}/settings/integrations`;

/** Turns the calendar feed on, or makes a new link (the old one stops working). Returns it once. */
export async function newFeedLink(org: string, includeTasks: boolean) {
  const ctx = await getOrgContext(org);
  const token = await createFeed(ctx, z.boolean().parse(includeTasks));
  revalidatePath(page(org));
  return { url: `${await appUrl()}/api/calendar/${token}.ics` };
}

export async function feedTasks(org: string, includeTasks: boolean) {
  await setFeedTasks(await getOrgContext(org), z.boolean().parse(includeTasks));
  revalidatePath(page(org));
}

export async function turnOffFeed(org: string) {
  await removeFeed(await getOrgContext(org));
  revalidatePath(page(org));
}
