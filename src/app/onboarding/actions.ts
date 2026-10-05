"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSystemDb } from "@/db";
import { createWorkspace, joinDemoWorkspace, userOrgSlugs } from "@/db/accounts";
import { STATUS_TEMPLATES } from "@/lib/status-templates";
import { getSessionUser } from "@/server/session";
import { COUNTRIES, SPACE_COLORS, TIMEZONES } from "./options";

const schema = z.object({
  accountType: z.enum(["agency", "brand"]),
  orgName: z.string().trim().min(2, "Give your workspace a name.").max(60),
  country: z.enum(COUNTRIES.map((c) => c.code) as [string, ...string[]]),
  timezone: z.enum(TIMEZONES as unknown as [string, ...string[]]),
  spaceName: z.string().trim().min(2, "Name your first space.").max(60),
  spaceColor: z.enum(SPACE_COLORS as unknown as [string, ...string[]]),
  template: z.enum(Object.keys(STATUS_TEMPLATES) as [keyof typeof STATUS_TEMPLATES, ...(keyof typeof STATUS_TEMPLATES)[]]),
});

export type OnboardingState = { error?: string } | undefined;

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const db = await getSystemDb();
  const existing = await userOrgSlugs(db, user.id);
  if (existing.length) redirect(`/o/${existing[0]}/overview`);

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const ws = await createWorkspace(db, { userId: user.id, ...parsed.data });
  redirect(`/o/${ws.orgSlug}/overview`);
}

/** Development only: explore the seeded KnockKnockClub agency instead of starting empty. */
export async function exploreDemo() {
  if (process.env.NODE_ENV !== "development") throw new Error("The demo workspace is only available in development.");
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const slug = await joinDemoWorkspace(await getSystemDb(), user.id);
  if (!slug) throw new Error("The demo workspace is not loaded.");
  redirect(`/o/${slug}/overview`);
}
