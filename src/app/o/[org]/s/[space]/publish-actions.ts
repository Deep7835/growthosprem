"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Issue } from "@/lib/publishing/rules";
import type { PlacementKind } from "@/lib/placements";
import {
  addPlacement,
  markPostedManually,
  removePlacement,
  retryPlacement,
  schedulePost,
  setShareToFeed,
  unschedulePost,
  type ScheduleMode,
} from "@/server/publishing";
import { requireSpaceAction } from "@/server/tenancy";

const uuid = z.uuid();
const refresh = (org: string, space: string) => revalidatePath(`/o/${org}/s/${space}`, "layout");

export type PublishResult = { issues: Issue[]; error?: string };

async function attempt(fn: () => Promise<{ issues: Issue[] } | void>): Promise<PublishResult> {
  try {
    return { issues: (await fn())?.issues ?? [] };
  } catch (e) {
    return { issues: [], error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function schedule(org: string, space: string, contentId: string, input: { mode: ScheduleMode; when?: string }): Promise<PublishResult> {
  const ctx = await requireSpaceAction(org, space, "content.schedule");
  const mode = z.enum(["now", "autopost", "manual"]).parse(input.mode);
  const result = await attempt(() => schedulePost(ctx, uuid.parse(contentId), { mode, when: input.when }));
  refresh(org, space);
  return result;
}

export async function unschedule(org: string, space: string, contentId: string): Promise<PublishResult> {
  const ctx = await requireSpaceAction(org, space, "content.schedule");
  const result = await attempt(() => unschedulePost(ctx, uuid.parse(contentId)));
  refresh(org, space);
  return result;
}

export async function retry(org: string, space: string, placementId: string): Promise<PublishResult> {
  const ctx = await requireSpaceAction(org, space, "content.schedule");
  const result = await attempt(() => retryPlacement(ctx, uuid.parse(placementId)));
  refresh(org, space);
  return result;
}

export async function markManual(org: string, space: string, placementId: string, link: string): Promise<PublishResult> {
  const ctx = await requireSpaceAction(org, space, "content.schedule");
  const result = await attempt(() => markPostedManually(ctx, uuid.parse(placementId), String(link ?? "")));
  refresh(org, space);
  return result;
}

export async function addPlatform(org: string, space: string, contentId: string, kind: PlacementKind): Promise<PublishResult> {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const result = await attempt(() => addPlacement(ctx, uuid.parse(contentId), kind));
  refresh(org, space);
  return result;
}

export async function removePlatform(org: string, space: string, placementId: string): Promise<PublishResult> {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const result = await attempt(() => removePlacement(ctx, uuid.parse(placementId)));
  refresh(org, space);
  return result;
}

export async function shareToFeed(org: string, space: string, placementId: string, value: boolean): Promise<PublishResult> {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const result = await attempt(() => setShareToFeed(ctx, uuid.parse(placementId), Boolean(value)));
  refresh(org, space);
  return result;
}
