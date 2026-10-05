"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { brandBrains } from "@/db/schema";
import { BrandBrainDraft, aiErrorMessage, creditsUsedThisMonth, draftBrandBrain, recordUsage } from "@/server/ai/service";
import { requireSpaceAction } from "@/server/tenancy";

const Fields = BrandBrainDraft.extend({ website: z.string().trim().max(300) });
const long = z.string().max(4000);

/** Brand Brain is edited by Owners, Admins and Managers of the space (PRD 4). */
export async function saveBrandBrain(org: string, space: string, fields: unknown) {
  const ctx = await requireSpaceAction(org, space, "space.settings");
  const parsed = Fields.extend(Object.fromEntries(["description", "audience", "voice", "dos", "donts", "offers", "usps", "faqs", "competitors"].map((k) => [k, long]))).parse(fields);
  await withOrg(ctx.org.id, async (tx) => {
    const values = { ...parsed, updatedBy: ctx.user.id, updatedAt: new Date() };
    const [existing] = await tx.select().from(brandBrains).where(eq(brandBrains.spaceId, ctx.space.id));
    if (existing) await tx.update(brandBrains).set(values).where(eq(brandBrains.id, existing.id));
    else await tx.insert(brandBrains).values({ orgId: ctx.org.id, spaceId: ctx.space.id, ...values });
  });
  revalidatePath(`/o/${org}/s/${space}/brand`);
}

/**
 * Drafts the fields from a website or pasted text (OB-06, AI-10). Returns the draft for the
 * person to review; nothing is saved until they press Save.
 */
export async function draftBrandBrainAction(
  org: string,
  space: string,
  source: { website: string } | { text: string },
): Promise<{ draft?: z.infer<typeof BrandBrainDraft>; error?: string }> {
  const ctx = await requireSpaceAction(org, space, "space.settings");
  if ((await creditsUsedThisMonth(ctx.org.id)) >= ctx.org.aiMonthlyCredits) return { error: "This month’s AI budget is used up." };
  let input: { website: string } | { text: string };
  if ("website" in source) {
    const url = z.url({ protocol: /^https?$/ }).safeParse(source.website.trim().match(/^https?:\/\//) ? source.website.trim() : `https://${source.website.trim()}`);
    if (!url.success) return { error: "That doesn’t look like a website address." };
    input = { website: url.data };
  } else {
    const text = z.string().trim().min(40, "Paste a little more about the brand.").max(20000).safeParse(source.text);
    if (!text.success) return { error: text.error.issues[0].message };
    input = { text: text.data };
  }
  try {
    const { draft, usage, model } = await draftBrandBrain(input);
    await recordUsage({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: ctx.space.id, kind: "brand_brain", model, usage });
    return { draft };
  } catch (e) {
    return { error: e instanceof Error && !("status" in e) ? e.message : aiErrorMessage(e) };
  }
}
