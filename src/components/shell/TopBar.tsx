"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { switchDevUser } from "@/app/actions/dev";
import { dummySignOut } from "@/app/actions/dummy-auth";
import { Icon } from "@/components/icons";
import { Popover } from "@/components/Popover";
import { Avatar } from "@/components/ui";
import { SearchPalette } from "./SearchPalette";
import { useShell } from "./ShellState";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", editor: "Editor" } as const;

/** The dark bar over the main column: sidebar toggle, search, notifications, plan and you. */
export function TopBar({
  orgSlug,
  user,
  role,
  devUsers,
  clerk,
  trialDaysLeft,
  billing,
  bell,
}: {
  orgSlug: string;
  user: { name: string; email: string };
  role: keyof typeof ROLE_LABEL;
  /** Empty unless AUTH_MODE=dev; then the menu switches between seeded users. */
  devUsers: { email: string; name: string }[];
  /** Clerk's own account menu; otherwise ours, with Log out for the dummy sign-in. */
  clerk: boolean;
  trialDaysLeft: number | null;
  /** UI2-01: the trial or plan badge, which opens Billing. */
  billing?: { phase: string; planName: string };
  bell?: React.ReactNode;
}) {
  const { collapsed, toggle } = useShell();
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 bg-bar px-2 text-white sm:px-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Show sidebar" : "Toggle sidebar"}
        title={collapsed ? "Show sidebar" : "Hide sidebar"}
        className="grid size-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
      >
        <Icon name="panel" size={17} />
      </button>
      <span aria-hidden className="h-5 w-px bg-white/15" />
      <Link href={`/o/${orgSlug}/overview`} aria-label="Plotline, Overview" className="grid size-7 place-items-center rounded-md bg-accent text-sm font-bold text-ink">
        P
      </Link>

      <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-4">
        <SearchPalette orgSlug={orgSlug} />
      </div>

      {bell}
      {(role === "owner" || role === "admin") && billing && (
        <Link
          href={`/o/${orgSlug}/settings/billing`}
          className={`hidden h-7 items-center rounded-md px-2.5 text-xs font-semibold sm:flex ${
            billing.phase === "expired" || billing.phase === "past_due" ? "bg-danger text-white" : billing.phase === "trial" ? "bg-accent text-ink hover:brightness-105" : "bg-white/10 text-white hover:bg-white/15"
          }`}
        >
          {billing.phase === "trial"
            ? trialDaysLeft != null
              ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left on trial`
              : "Free trial"
            : billing.phase === "expired"
              ? "Choose a plan"
              : billing.phase === "past_due"
                ? "Payment due"
                : `${billing.planName} plan`}
        </Link>
      )}
      {clerk ? (
        <span className="grid size-8 place-items-center" title={`${user.name} · ${ROLE_LABEL[role]}`}>
          <UserButton />
        </span>
      ) : (
        <Popover
          label={`${user.name}, ${ROLE_LABEL[role]}`}
          buttonClassName="grid size-8 place-items-center rounded-full hover:ring-2 hover:ring-white/20"
          panelClassName="right-0 top-full mt-2 w-72"
          button={<Avatar name={user.name} color="#F2A93B" size={28} />}
        >
          {() => (
            <div className="p-2">
              <p className="px-1 text-sm font-semibold">{user.name}</p>
              <p className="px-1 pb-2 text-[13px] text-muted">
                {user.email} · {ROLE_LABEL[role]}
              </p>
              <Link href={`/o/${orgSlug}/settings/profile`} className="flex rounded-lg px-2 py-2 text-sm hover:bg-subtle">
                Profile and settings
              </Link>
              {devUsers.length > 0 ? (
                <>
                  <p className="mb-1 border-t border-line-soft px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Development: sign in as</p>
                  <form action={switchDevUser} className="flex flex-col gap-0.5">
                    {devUsers.map((u) => (
                      <button
                        key={u.email}
                        name="email"
                        value={u.email}
                        type="submit"
                        className={`rounded-lg px-2 py-2 text-left text-sm hover:bg-subtle ${u.email === user.email ? "font-semibold" : ""}`}
                      >
                        {u.name} <span className="text-muted">· {u.email}</span>
                      </button>
                    ))}
                  </form>
                </>
              ) : (
                <form action={dummySignOut} className="border-t border-line-soft pt-1">
                  <button type="submit" className="flex w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-subtle">
                    Log out
                  </button>
                </form>
              )}
            </div>
          )}
        </Popover>
      )}
    </header>
  );
}
