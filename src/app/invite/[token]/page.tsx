import { SignOutButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { getSystemDb } from "@/db";
import { findInviteByToken } from "@/db/invites";
import { buttonClass } from "@/components/ui";
import { authMode, getSessionUser } from "@/server/session";
import { acceptInviteByToken } from "./actions";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

const ROLE = { owner: "Owner", admin: "Admin", manager: "Manager", editor: "Editor" } as const;

const CLOSED = {
  missing: ["This invite link doesn’t work", "Check that you copied the whole link, or ask for a new invite."],
  expired: ["This invite has expired", "Invites work for 7 days. Ask the person who invited you to send a new one."],
  revoked: ["This invite was cancelled", "Ask the person who invited you if you should still join."],
  accepted: ["This invite has already been used", "If it was you, sign in to open the workspace."],
} as const;

function mask(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-ground px-4 py-16">
      <div className="flex items-center gap-2 font-display text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-lg bg-accent">P</span>
        Plotline
      </div>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-line bg-surface p-6">{children}</div>
    </main>
  );
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [found, user] = await Promise.all([findInviteByToken(await getSystemDb(), token), getSessionUser()]);

  if (found.state !== "ok") {
    const [title, body] = CLOSED[found.state];
    return (
      <Frame>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="text-muted">{body}</p>
        {found.state === "accepted" && (
          <Link href="/" className={buttonClass("primary")}>
            Open Plotline
          </Link>
        )}
      </Frame>
    );
  }

  const { invite, orgName, inviterName, spaceNames } = found;
  const back = encodeURIComponent(`/invite/${token}`);
  const details = (
    <>
      <h1 className="font-display text-2xl font-bold leading-tight">Join {orgName}</h1>
      <p className="leading-relaxed text-ink-2">
        {inviterName ?? "Someone"} invited you to join <strong>{orgName}</strong> as {ROLE[invite.role] === "Admin" || ROLE[invite.role] === "Editor" ? "an" : "a"}{" "}
        <strong>{ROLE[invite.role]}</strong>
        {invite.role === "admin" ? ", with access to every space." : ` in ${spaceNames.join(", ")}.`}
      </p>
    </>
  );

  if (!user) {
    return (
      <Frame>
        {details}
        <p className="text-sm text-muted">Use {mask(invite.email)} so the invite can find you.</p>
        <Link href={`/sign-up?redirect_url=${back}`} className={`${buttonClass("primary")} h-11`}>
          Create your account
        </Link>
        <Link href={`/sign-in?redirect_url=${back}`} className={`${buttonClass("secondary")} h-11`}>
          I already have an account
        </Link>
      </Frame>
    );
  }

  if (user.email !== invite.email) {
    return (
      <Frame>
        {details}
        <p className="rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn-ink">
          This invite is for {mask(invite.email)}, but you’re signed in as {user.email}. Sign in with the invited email to accept it.
        </p>
        {authMode() === "clerk" && (
          <SignOutButton redirectUrl={`/sign-in?redirect_url=${back}`}>
            <button type="button" className={`${buttonClass("secondary")} h-11`}>
              Sign out and switch account
            </button>
          </SignOutButton>
        )}
      </Frame>
    );
  }

  return (
    <Frame>
      {details}
      <form action={acceptInviteByToken.bind(null, token)}>
        <button type="submit" className={`${buttonClass("primary")} h-11 w-full`}>
          Join {orgName}
        </button>
      </form>
    </Frame>
  );
}
