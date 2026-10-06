import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/site/Landing";
import { getSystemDb } from "@/db";
import { userOrgSlugs } from "@/db/accounts";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = {
  title: { absolute: "Plotline · Social media workspace for agencies and brands" },
  description:
    "Plan, create, approve, publish and grow every client’s Instagram and Facebook from one workspace, with an AI Copilot that reads your real numbers. Hinglish captions, festival calendar and GST invoices built in.",
};

/** The public website for visitors; people who are signed in go straight to their workspace. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <Landing />;
  const [first] = await userOrgSlugs(await getSystemDb(), user.id);
  redirect(first ? `/o/${first}/overview` : "/onboarding");
}
