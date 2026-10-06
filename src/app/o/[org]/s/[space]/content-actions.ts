"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { duplicateContent, repurposeContent, revokeLink, shareContent } from "@/server/content-ops";
import { requireSpaceAction } from "@/server/tenancy";
import { appUrl } from "@/server/url";

// The post window's menu: Duplicate, Repurpose and Share (PRD CT-12, SH-02).

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const uuid = z.uuid();
const spacePath = (org: string, space: string) => `/o/${org}/s/${space}`;
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof z.ZodError ? "That request isn’t valid." : e instanceof Error ? e.message : "Something went wrong." });

export async function duplicatePost(org: string, space: string, id: string): Promise<Result<{ id: string }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const copy = await duplicateContent(ctx, uuid.parse(id));
    revalidatePath(spacePath(org, space), "layout");
    return { ok: true, id: copy.id };
  } catch (e) {
    return fail(e);
  }
}

export async function repurposePost(org: string, space: string, id: string): Promise<Result<{ count: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const r = await repurposeContent(ctx, uuid.parse(id));
    revalidatePath(spacePath(org, space), "layout");
    return { ok: true, count: r.created.length + 1 };
  } catch (e) {
    return fail(e);
  }
}

const Share = z.object({
  ids: z.array(uuid).min(1).max(100),
  permission: z.enum(["view", "comment", "approve"]),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)]).nullable(),
});

export async function sharePosts(org: string, space: string, raw: unknown): Promise<Result<{ url: string; count: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "share.create");
    const input = Share.parse(raw);
    const r = await shareContent(ctx, input.ids, { permission: input.permission, expiresInDays: input.expiresInDays });
    revalidatePath(spacePath(org, space), "layout");
    return { ok: true, url: `${await appUrl()}/review/${r.token}`, count: r.count };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeShareLink(org: string, space: string, linkId: string): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "share.create");
    await revokeLink(ctx, uuid.parse(linkId));
    revalidatePath(spacePath(org, space), "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
