"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarSpace {
  slug: string;
  name: string;
  avatarColor: string;
}

function NavLink({ href, active, children, inset = false }: { href: string; active: boolean; children: React.ReactNode; inset?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg py-2 text-sm ${inset ? "pl-[38px] pr-2" : "px-2"} ${
        active ? "bg-ground font-semibold text-ink" : "text-ink-2 hover:bg-subtle"
      }`}
    >
      {children}
    </Link>
  );
}

export function Sidebar({
  orgSlug,
  orgName,
  spaces,
  canInvite,
}: {
  orgSlug: string;
  orgName: string;
  spaces: SidebarSpace[];
  /** Owners, Admins and Managers see "Invite members"; Editors see the read-only list as "Members". */
  canInvite: boolean;
}) {
  const pathname = usePathname();
  const base = `/o/${orgSlug}`;

  return (
    <nav aria-label="Main" className="flex w-full shrink-0 flex-col gap-0.5 border-line bg-surface px-3 py-4 md:w-60 md:border-r">
      <div className="flex items-center gap-2.5 px-2 pb-3.5">
        <span className="grid size-[30px] place-items-center rounded-lg bg-ink font-bold text-white">{orgName[0]}</span>
        <span className="font-bold">{orgName}</span>
      </div>
      <NavLink href={`${base}/overview`} active={pathname === `${base}/overview`}>
        Overview
      </NavLink>
      <NavLink href={`${base}/ai`} active={pathname.startsWith(`${base}/ai`)}>
        AI Copilot
      </NavLink>

      <div className="px-2 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">Social spaces</div>
      {spaces.length === 0 && <p className="px-2 text-sm text-muted">You haven’t been added to a space yet.</p>}
      {spaces.map((sp) => {
        const spaceBase = `${base}/s/${sp.slug}`;
        const inSpace = pathname.startsWith(spaceBase);
        return (
          <div key={sp.slug} className="flex flex-col gap-0.5">
            <NavLink href={`${spaceBase}/board`} active={inSpace && !/\/(analytics|audit)/.test(pathname.slice(spaceBase.length))}>
              <span
                className="grid size-[22px] place-items-center rounded-md text-xs font-bold text-ink"
                style={{ background: sp.avatarColor }}
              >
                {sp.name[0]}
              </span>
              {sp.name}
            </NavLink>
            {inSpace && (
              <>
                <NavLink href={`${spaceBase}/audit`} active={pathname.startsWith(`${spaceBase}/audit`)} inset>
                  First audit
                </NavLink>
                <NavLink href={`${spaceBase}/analytics`} active={pathname.startsWith(`${spaceBase}/analytics`)} inset>
                  Analytics
                </NavLink>
              </>
            )}
          </div>
        );
      })}
      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        <NavLink href={`${base}/settings/members`} active={pathname.startsWith(`${base}/settings/members`)}>
          {canInvite ? "Invite members" : "Members"}
        </NavLink>
      </div>
    </nav>
  );
}
