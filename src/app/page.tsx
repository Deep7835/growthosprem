import { redirect } from "next/navigation";
import { Landing, landingMetadata } from "@/components/site/Landing";
import { getSystemDb } from "@/db";
import { userOrgSlugs } from "@/db/accounts";
import { getSessionUser } from "@/server/session";

export const metadata = landingMetadata;

/** The public website for visitors; people who are signed in go straight to their workspace. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) return <Landing />;
  const [first] = await userOrgSlugs(await getSystemDb(), user.id);
  redirect(first ? `/o/${first}/overview` : "/onboarding");
}
