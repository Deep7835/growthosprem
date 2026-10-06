"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addTag, deleteTag, renameOrg, renameTag, saveBranding, setDisplayName } from "@/server/org-settings";
import { getOrgContext } from "@/server/tenancy";

export type SettingsResult = { ok: true } | { ok: false; error: string };

async function run(org: string, fn: (ctx: Awaited<ReturnType<typeof getOrgContext>>) => Promise<void>): Promise<SettingsResult> {
  try {
    await fn(await getOrgContext(org));
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "That isn’t valid.") : e instanceof Error ? e.message : "Couldn’t save." };
  }
}

const name = (max: number, what: string) => z.string().trim().min(1, `Add a ${what}.`).max(max, `Keep the ${what} under ${max} characters.`);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #F2A93B.");
const tag = name(40, "tag name").regex(/^[^,#]+$/, "Tags can’t contain commas or #.");

export async function saveDisplayName(org: string, value: string) {
  return run(org, (ctx) => setDisplayName(ctx, name(60, "name").parse(value)));
}

export async function saveOrgName(org: string, value: string) {
  return run(org, (ctx) => renameOrg(ctx, name(80, "name").parse(value)));
}

export async function saveBrandingAction(org: string, value: { primary: string | null; secondary: string | null; logoData: string | null; enabled: boolean }) {
  return run(org, (ctx) =>
    saveBranding(ctx, {
      primary: value.primary === null ? null : hex.parse(value.primary),
      secondary: value.secondary === null ? null : hex.parse(value.secondary),
      // A small PNG made in the browser (256 px); about 100 KB at most.
      logoData: value.logoData === null ? null : z.string().startsWith("data:image/png;base64,").max(140_000, "That logo is too large. Try a simpler image.").parse(value.logoData),
      enabled: z.boolean().parse(value.enabled),
    }),
  );
}

export async function addTagAction(org: string, value: string) {
  return run(org, (ctx) => addTag(ctx, tag.parse(value)));
}

export async function renameTagAction(org: string, from: string, to: string) {
  return run(org, (ctx) => renameTag(ctx, z.string().min(1).parse(from), tag.parse(to)));
}

export async function deleteTagAction(org: string, value: string) {
  return run(org, (ctx) => deleteTag(ctx, z.string().min(1).parse(value)));
}
