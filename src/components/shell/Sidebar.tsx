"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface SidebarSpace {
  slug: string;
  name: string;
  avatarColor: string;
  /** Open projects, shown under the space while you're in it (UI-08). */
  projects?: { id: string; name: string; color: string | null }[];
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
  unread = 0,
  canManageSpaces = false,
  archived = [],
}: {
  orgSlug: string;
  orgName: string;
  spaces: SidebarSpace[];
  /** Owners, Admins and Managers see "Invite members"; Editors see the read-only list as "Members". */
  canInvite: boolean;
  /** UI-02: unread count beside Notifications. */
  unread?: number;
  /** Owners and Admins create, archive and delete spaces (SP-01, SP-05). */
  canManageSpaces?: boolean;
  /** SP-05: shown under "Show archived spaces". */
  archived?: SidebarSpace[];
}) {
  const [showArchived, setShowArchived] = useState(false);
  const pathname = usePathname();
  const base = `/o/${orgSlug}`;

  return (
    <nav aria-label="Main" className="flex w-full shrink-0 flex-col gap-0.5 border-line bg-surface px-3 py-4 md:w-60 md:border-r">
      <div className="flex items-center gap-2.5 px-2 pb-3.5">
        <span className="grid size-[30px] place-items-center rounded-lg bg-ink font-bold text-white">{orgName[0]}</span>
        <span className="font-bold">{orgName}</span>
      </div>
      <NavLink href={`${base}/overview`} active={pathname.startsWith(`${base}/overview`)}>
        Overview
      </NavLink>
      <NavLink href={`${base}/notifications`} active={pathname.startsWith(`${base}/notifications`)}>
        <span className="flex-1">Notifications</span>
        {unread > 0 && (
          <span aria-label={`${unread} unread`} className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </NavLink>
      <NavLink href={`${base}/ai`} active={pathname.startsWith(`${base}/ai`)}>
        AI Copilot
      </NavLink>

      <div className="flex items-center justify-between px-2 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
        Social spaces
        {canManageSpaces && (
          <Link href={`${base}/settings/spaces?new=1`} aria-label="Create a space" title="Create a space" className="grid size-6 place-items-center rounded-md text-base normal-case text-ink-2 hover:bg-subtle">
            +
          </Link>
        )}
      </div>
      {spaces.length === 0 && <p className="px-2 text-sm text-muted">You haven’t been added to a space yet.</p>}
      {spaces.map((sp) => {
        const spaceBase = `${base}/s/${sp.slug}`;
        const inSpace = pathname.startsWith(spaceBase);
        return (
          <div key={sp.slug} className="flex flex-col gap-0.5">
            <NavLink href={`${spaceBase}/board`} active={inSpace && !/^\/(analytics|audit|p\/)/.test(pathname.slice(spaceBase.length))}>
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
                {(sp.projects ?? []).map((p) => (
                  <NavLink key={p.id} href={`${spaceBase}/p/${p.id}/board`} active={pathname.startsWith(`${spaceBase}/p/${p.id}`)} inset>
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: p.color ?? "#9CA3AF" }} />
                    <span className="truncate">{p.name}</span>
                  </NavLink>
                ))}
              </>
            )}
          </div>
        );
      })}
      {archived.length > 0 && (
        <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className="px-2 py-1.5 text-left text-xs font-semibold text-muted hover:text-ink">
          {showArchived ? "Hide archived spaces" : `Show archived spaces (${archived.length})`}
        </button>
      )}
      {showArchived &&
        archived.map((sp) => (
          <NavLink key={sp.slug} href={`${base}/s/${sp.slug}/board`} active={pathname.startsWith(`${base}/s/${sp.slug}`)}>
            <span className="grid size-[22px] place-items-center rounded-md text-xs font-bold text-ink opacity-60" style={{ background: sp.avatarColor }}>
              {sp.name[0]}
            </span>
            <span className="text-muted">{sp.name}</span>
          </NavLink>
        ))}
      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        {canManageSpaces && (
          <>
            <NavLink href={`${base}/settings/spaces`} active={pathname.startsWith(`${base}/settings/spaces`)}>
              Spaces
            </NavLink>
            <NavLink href={`${base}/settings/billing`} active={pathname.startsWith(`${base}/settings/billing`)}>
              Billing
            </NavLink>
          </>
        )}
        <NavLink href={`${base}/settings/members`} active={pathname.startsWith(`${base}/settings/members`)}>
          {canInvite ? "Invite members" : "Members"}
        </NavLink>
      </div>
    </nav>
  );
}
