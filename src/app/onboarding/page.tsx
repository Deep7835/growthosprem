import { redirect } from "next/navigation";
import { getSystemDb } from "@/db";
import { userOrgSlugs } from "@/db/accounts";
import { pendingInvitesForEmail } from "@/db/invites";
import { buttonClass } from "@/components/ui";
import { switchDevUser } from "@/app/actions/dev";
import { getSessionUser, listDevUsers } from "@/server/session";
import { acceptInviteForMe } from "../invite/[token]/actions";
import { exploreDemo } from "./actions";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const db = await getSystemDb();
  const [existing] = await userOrgSlugs(db, user.id);
  if (existing) redirect(`/o/${existing}/overview`);
  const [invited, devUsers] = await Promise.all([pendingInvitesForEmail(db, user.email), listDevUsers()]);
  const ROLE = { owner: "Owner", admin: "Admin", manager: "Manager", editor: "Editor" } as const;

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-ground px-4 py-12">
      <div className="flex items-center gap-2 font-display text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-lg bg-accent">P</span>
        Plotline
      </div>
      {invited.length > 0 && (
        <section className="flex w-full max-w-xl flex-col gap-3">
          <h1 className="font-display text-2xl font-bold">You’ve been invited</h1>
          {invited.map((inv) => (
            <form key={inv.id} action={acceptInviteForMe.bind(null, inv.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
              <span>
                Join <strong>{inv.orgName}</strong> as {ROLE[inv.role]}
              </span>
              <button type="submit" className={buttonClass("primary", "sm")}>
                Join {inv.orgName}
              </button>
            </form>
          ))}
          <p className="text-sm text-muted">Or set up a workspace of your own:</p>
        </section>
      )}
      <OnboardingForm firstName={user.name.split(" ")[0]} />
      {devUsers.length > 0 && (
        <form action={switchDevUser} className="flex w-full max-w-xl flex-wrap items-center gap-2 rounded-xl border border-dashed border-faint p-4 text-sm text-muted">
          <span className="w-full">AUTH_MODE=dev: signed in as {user.name}. Switch to</span>
          {devUsers
            .filter((u) => u.email !== user.email)
            .map((u) => (
              <button key={u.email} name="email" value={u.email} type="submit" className={buttonClass("secondary", "sm")}>
                {u.name}
              </button>
            ))}
        </form>
      )}
      {process.env.NODE_ENV === "development" && (
        <form action={exploreDemo} className="flex w-full max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-faint p-4 text-sm text-muted">
          <span>Development: skip setup and explore the demo agency with sample data.</span>
          <button type="submit" className={buttonClass("secondary", "sm")}>
            Explore KnockKnockClub
          </button>
        </form>
      )}
    </main>
  );
}
