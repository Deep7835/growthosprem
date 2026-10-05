import { redirect } from "next/navigation";
import { getSystemDb } from "@/db";
import { userOrgSlugs } from "@/db/accounts";
import { getSessionUser } from "@/server/session";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const [first] = await userOrgSlugs(await getSystemDb(), user.id);
  redirect(first ? `/o/${first}/overview` : "/onboarding");
}
