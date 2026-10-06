"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addSamples, reply, setDone } from "@/server/inbox";
import { requireSpaceAction } from "@/server/tenancy";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the message.") : e instanceof Error ? e.message : "Something went wrong." });
const path = (org: string, space: string) => `/o/${org}/s/${space}/inbox`;

/** Replying is public, like publishing: Managers, and Editors where the space allows it. */
export async function replyAction(org: string, space: string, threadId: string, body: string): Promise<Result<{ sample: boolean }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.schedule");
    const r = await reply(ctx, z.uuid().parse(threadId), z.string().trim().min(1, "Write a reply first.").max(2200, "Keep replies under 2,200 characters.").parse(body));
    revalidatePath(path(org, space));
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function doneAction(org: string, space: string, threadId: string, done: boolean): Promise<Result> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    await setDone(ctx, z.uuid().parse(threadId), z.boolean().parse(done));
    revalidatePath(path(org, space));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function samplesAction(org: string, space: string): Promise<Result<{ added: number }>> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const added = await addSamples(ctx);
    revalidatePath(path(org, space));
    return { ok: true, added };
  } catch (e) {
    return fail(e);
  }
}
