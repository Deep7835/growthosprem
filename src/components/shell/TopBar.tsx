import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { switchDevUser } from "@/app/actions/dev";
import { Avatar } from "@/components/ui";
import { SearchPalette } from "./SearchPalette";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", editor: "Editor" } as const;

export function TopBar({
  orgSlug,
  user,
  role,
  devUsers,
  trialDaysLeft,
  billing,
  bell,
}: {
  orgSlug: string;
  user: { name: string; email: string };
  role: keyof typeof ROLE_LABEL;
  /** Empty unless AUTH_MODE=dev; then the menu switches between seeded users. */
  devUsers: { email: string; name: string }[];
  trialDaysLeft: number | null;
  /** UI2-01: the trial or plan badge, which opens Billing. */
  billing?: { phase: string; planName: string };
  bell?: React.ReactNode;
}) {
  // Clerk's menu (profile, sign out) when signed in through Clerk; the seeded-user switcher with AUTH_MODE=dev.
  return (
    <header className="flex min-h-12 flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-1.5">
      <Link href={`/o/${orgSlug}/overview`} className="flex items-center gap-2 font-display text-[17px] font-bold">
        <span className="grid size-[26px] place-items-center rounded-[7px] bg-accent text-sm">G</span>
        Growth OS
      </Link>
      <SearchPalette orgSlug={orgSlug} />
      <div className="flex-1" />
      {bell}
      {(role === "owner" || role === "admin") && billing && (
        <Link
          href={`/o/${orgSlug}/settings/billing`}
          className={`flex h-[30px] items-center rounded-full border px-3 text-[13px] font-semibold ${
            billing.phase === "expired" || billing.phase === "past_due" ? "border-danger bg-danger-bg text-danger" : billing.phase === "trial" ? "border-line bg-accent-bg text-accent-ink" : "border-line bg-surface text-ink-2"
          }`}
        >
          {billing.phase === "trial"
            ? trialDaysLeft != null
              ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in trial`
              : "Free trial"
            : billing.phase === "expired"
              ? "Choose a plan"
              : billing.phase === "past_due"
                ? "Payment due"
                : `${billing.planName} plan`}
        </Link>
      )}
      {devUsers.length === 0 ? (
        <div className="flex items-center gap-2.5">
          <span className="hidden text-right text-[13px] leading-tight sm:block">
            <span className="block font-semibold">{user.name}</span>
            <span className="block text-muted">{ROLE_LABEL[role]}</span>
          </span>
          <UserButton />
        </div>
      ) : (
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-subtle">
            <Avatar name={user.name} color="#17181C" size={30} />
            <span className="hidden text-left text-[13px] leading-tight sm:block">
              <span className="block font-semibold">{user.name}</span>
              <span className="block text-muted">{ROLE_LABEL[role]}</span>
            </span>
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-surface p-3 shadow-lg">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Development: sign in as</p>
            <form action={switchDevUser} className="flex flex-col gap-1">
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
          </div>
        </details>
      )}
    </header>
  );
}
