"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { menuItem, Popover } from "@/components/Popover";
import { useShell } from "./ShellState";
import { CommunityMenu, ProductUpdates } from "./SidebarExtras";

export interface SidebarSpace {
  slug: string;
  name: string;
  avatarColor: string;
  /** Open projects, listed under the space's Projects group (UI-08). */
  projects?: { id: string; name: string; color: string | null }[];
}

const rowBase = "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px]";
const rowTone = (active: boolean) => (active ? "bg-select font-medium text-ink" : "text-ink-2 hover:bg-line-soft hover:text-ink");

function NavItem({ href, icon, active, children }: { href: string; icon: IconName; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${rowBase} ${rowTone(active)}`}>
      <Icon name={icon} />
      {children}
    </Link>
  );
}

function SpaceAvatar({ name, color, dim = false }: { name: string; color: string; dim?: boolean }) {
  return (
    <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-[5px] text-[11px] font-bold text-ink ${dim ? "opacity-50" : ""}`} style={{ background: color }}>
      {name[0]}
    </span>
  );
}

/** A space with its children: First audit, Analytics, and a Projects group with Create project. */
function SpaceTree({
  sp,
  base,
  pathname,
  open,
  onToggle,
  projectsOpen,
  onToggleProjects,
  canManage,
  query,
  dim = false,
}: {
  sp: SidebarSpace;
  base: string;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  projectsOpen: boolean;
  onToggleProjects: () => void;
  canManage: boolean;
  query: string;
  dim?: boolean;
}) {
  const spaceBase = `${base}/s/${sp.slug}`;
  const inSpace = pathname === spaceBase || pathname.startsWith(`${spaceBase}/`);
  const rest = inSpace ? pathname.slice(spaceBase.length) : "";
  const spaceActive = inSpace && !/^\/(analytics|audit|p\/)/.test(rest);
  const projects = (sp.projects ?? []).filter((p) => !query || p.name.toLowerCase().includes(query) || sp.name.toLowerCase().includes(query));
  const child = (active: boolean) => `${rowBase} ${rowTone(active)} pl-2`;

  return (
    <li>
      <div className={`group relative flex items-center rounded-md ${rowTone(spaceActive)}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${sp.name}`}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-ink"
        >
          <span className="group-hover:hidden group-focus-within:hidden">
            <SpaceAvatar name={sp.name} color={sp.avatarColor} dim={dim} />
          </span>
          <span className="hidden group-hover:block group-focus-within:block">
            <Icon name={open ? "chevronDown" : "chevronRight"} size={15} />
          </span>
        </button>
        <Link href={`${spaceBase}/board`} aria-current={spaceActive ? "page" : undefined} className={`flex h-8 min-w-0 flex-1 items-center pr-8 text-[13.5px] ${dim ? "text-muted" : ""}`}>
          <span className="truncate">{sp.name}</span>
        </Link>
        <Popover
          label={`${sp.name} actions`}
          className="!absolute right-0.5 top-0.5"
          buttonClassName="grid size-7 place-items-center rounded-md text-muted opacity-0 hover:bg-line hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
          panelClassName="left-0 top-full mt-1 w-52"
          button={<Icon name="more" size={18} />}
        >
          {(close) => (
            <div className="flex flex-col" onClick={close}>
              <Link href={`${spaceBase}/board`} className={menuItem}>
                <Icon name="board" /> Board
              </Link>
              <Link href={`${spaceBase}/calendar`} className={menuItem}>
                <Icon name="calendar" /> Calendar
              </Link>
              <Link href={`${spaceBase}/analytics`} className={menuItem}>
                <Icon name="chart" /> Analytics
              </Link>
              <div className="my-1 h-px bg-line-soft" />
              <Link href={`${spaceBase}/settings`} className={menuItem}>
                <Icon name="gear" /> Space settings
              </Link>
              <Link href={`${spaceBase}/settings/members`} className={menuItem}>
                <Icon name="users" /> Members
              </Link>
            </div>
          )}
        </Popover>
      </div>

      {open && (
        <ul className="ml-[15px] flex flex-col gap-px border-l border-line pl-2 pt-px">
          <li>
            <Link href={`${spaceBase}/audit`} aria-current={rest.startsWith("/audit") ? "page" : undefined} className={child(rest.startsWith("/audit"))}>
              <Icon name="clipboard" /> First audit
            </Link>
          </li>
          <li>
            <Link href={`${spaceBase}/analytics`} aria-current={rest.startsWith("/analytics") ? "page" : undefined} className={child(rest.startsWith("/analytics"))}>
              <Icon name="chart" /> Analytics
            </Link>
          </li>
          <li>
            <button type="button" onClick={onToggleProjects} aria-expanded={projectsOpen} className={`${child(false)} w-full`}>
              <Icon name="folder" />
              <span className="flex-1 text-left">Projects</span>
              <span className="text-xs text-muted">{sp.projects?.length ?? 0}</span>
              <Icon name={projectsOpen ? "chevronDown" : "chevronRight"} size={14} className="text-muted" />
            </button>
            {projectsOpen && (
              <ul className="ml-[15px] flex flex-col gap-px border-l border-line pl-2 pt-px">
                {canManage && !dim && (
                  <li>
                    <Link href={`${spaceBase}/settings/projects?new=1`} className={child(false)}>
                      <Icon name="folderPlus" /> Create project
                    </Link>
                  </li>
                )}
                {projects.map((p) => {
                  const active = rest.startsWith(`/p/${p.id}`);
                  return (
                    <li key={p.id}>
                      <Link href={`${spaceBase}/p/${p.id}/board`} aria-current={active ? "page" : undefined} className={child(active)}>
                        <span className="relative">
                          <Icon name="folder" />
                          <span aria-hidden className="absolute -bottom-px -right-px size-1.5 rounded-full ring-1 ring-subtle" style={{ background: p.color ?? "#9CA3AF" }} />
                        </span>
                        <span className="truncate">{p.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        </ul>
      )}
    </li>
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
  /** Owners, Admins and Managers see "Invite members" and "Create project"; Editors see "Members". */
  canInvite: boolean;
  /** UI-02: unread count beside Notifications. */
  unread?: number;
  /** Owners and Admins create, archive and delete spaces (SP-01, SP-05), and see Billing. */
  canManageSpaces?: boolean;
  /** SP-05: listed when "Show archived spaces" is on. */
  archived?: SidebarSpace[];
}) {
  const pathname = usePathname();
  const { collapsed, drawer, closeDrawer } = useShell();
  const base = `/o/${orgSlug}`;
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // Expanded spaces: the one you're in opens by itself until you close it.
  const [openSpaces, setOpenSpaces] = useState<Record<string, boolean>>({});
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const q = query.trim().toLowerCase();
  const matches = (sp: SidebarSpace) => !q || sp.name.toLowerCase().includes(q) || (sp.projects ?? []).some((p) => p.name.toLowerCase().includes(q));
  const tree = (sp: SidebarSpace, dim = false) => {
    const inSpace = pathname.startsWith(`${base}/s/${sp.slug}/`) || pathname === `${base}/s/${sp.slug}`;
    const projectHit = Boolean(q) && (sp.projects ?? []).some((p) => p.name.toLowerCase().includes(q));
    return (
      <SpaceTree
        key={sp.slug}
        sp={sp}
        base={base}
        pathname={pathname}
        open={projectHit || (openSpaces[sp.slug] ?? inSpace)}
        onToggle={() => setOpenSpaces((o) => ({ ...o, [sp.slug]: !(o[sp.slug] ?? inSpace) }))}
        projectsOpen={projectHit || (openProjects[sp.slug] ?? true)}
        onToggleProjects={() => setOpenProjects((o) => ({ ...o, [sp.slug]: !(o[sp.slug] ?? true) }))}
        canManage={canInvite}
        query={q}
        dim={dim}
      />
    );
  };
  const shown = spaces.filter(matches);
  const shownArchived = showArchived ? archived.filter(matches) : [];

  return (
    <>
      {drawer && <div aria-hidden onClick={closeDrawer} className="fixed inset-0 z-40 bg-ink/40 md:hidden" />}
      <nav
        aria-label="Main"
        // Following a link closes the drawer on phones.
        onClick={(e) => (e.target as HTMLElement).closest("a") && closeDrawer()}
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col border-r border-line bg-subtle transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-dvh md:translate-x-0 md:transition-none ${
          drawer ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:hidden" : ""}`}
      >
        {/* Organisation */}
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-sm font-bold text-ink">{orgName[0]}</span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{orgName}</span>
          <Popover
            label="Organisation settings"
            buttonClassName="grid size-8 place-items-center rounded-md text-muted hover:bg-line-soft hover:text-ink aria-expanded:bg-line-soft aria-expanded:text-ink"
            panelClassName="right-0 top-full mt-1 w-56"
            button={<Icon name="gear" />}
          >
            {(close) => (
              <div className="flex flex-col" onClick={close}>
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Organisation</p>
                <Link href={`${base}/settings/members`} className={menuItem}>
                  <Icon name="users" /> Members
                </Link>
                {canManageSpaces && (
                  <>
                    <Link href={`${base}/settings/spaces`} className={menuItem}>
                      <Icon name="board" /> Spaces
                    </Link>
                    <Link href={`${base}/settings/billing`} className={menuItem}>
                      <Icon name="card" /> Billing
                    </Link>
                  </>
                )}
                <div className="my-1 h-px bg-line-soft" />
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">You</p>
                <Link href={`${base}/notifications/settings`} className={menuItem}>
                  <Icon name="bell" /> Notification settings
                </Link>
              </div>
            )}
          </Popover>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 py-3">
          <div className="flex flex-col gap-px">
            <NavItem href={`${base}/overview`} icon="home" active={pathname.startsWith(`${base}/overview`)}>
              Overview
            </NavItem>
            <NavItem href={`${base}/notifications`} icon="bell" active={pathname === `${base}/notifications`}>
              <span className="flex-1">Notifications</span>
              {unread > 0 && (
                <span aria-label={`${unread} unread`} className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </NavItem>
            <NavItem href={`${base}/ai`} icon="sparkles" active={pathname.startsWith(`${base}/ai`)}>
              AI Copilot
            </NavItem>
          </div>

          <div className="mt-5 flex items-center gap-1 px-2 pb-1.5">
            <span className="text-xs font-medium text-muted">Social spaces</span>
            <span className="group relative">
              <span tabIndex={0} aria-label="About social spaces" className="grid size-5 place-items-center rounded text-faint hover:text-ink">
                <Icon name="info" size={13} />
              </span>
              <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-56 rounded-lg bg-ink px-2.5 py-2 text-xs leading-snug text-white shadow-lg group-hover:block group-focus-within:block">
                A space holds one client or brand: its accounts, content, tasks, projects and members.
              </span>
            </span>
            <span className="flex-1" />
            <Popover
              label="Social spaces options"
              buttonClassName="grid size-6 place-items-center rounded text-muted hover:bg-line-soft hover:text-ink aria-expanded:bg-line-soft"
              panelClassName="right-0 top-full mt-1 w-60"
              button={<Icon name="more" size={18} />}
            >
              {() => (
                <div className="flex flex-col">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-[13.5px] hover:bg-subtle">
                    Show archived spaces{archived.length ? ` (${archived.length})` : ""}
                    <input type="checkbox" role="switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="peer sr-only" />
                    <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-line transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-focus" />
                  </label>
                </div>
              )}
            </Popover>
          </div>

          {spaces.length + archived.length > 0 && (
            <label className="mx-0.5 mb-1.5 flex h-8 items-center gap-2 rounded-md bg-line-soft px-2 text-muted focus-within:bg-surface focus-within:ring-1 focus-within:ring-line">
              <Icon name="search" size={14} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search spaces" aria-label="Search spaces" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
              {query && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="hover:text-ink">
                  <Icon name="x" size={14} />
                </button>
              )}
            </label>
          )}

          {spaces.length === 0 && <p className="px-2 py-1 text-[13px] text-muted">You haven’t been added to a space yet.</p>}
          <ul className="flex flex-col gap-px">
            {shown.map((sp) => tree(sp))}
            {shownArchived.length > 0 && <li className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-faint">Archived</li>}
            {shownArchived.map((sp) => tree(sp, true))}
          </ul>
          {q && shown.length + shownArchived.length === 0 && <p className="px-2 py-1 text-[13px] text-muted">No spaces match “{query.trim()}”.</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-px border-t border-line px-2.5 py-2">
          {canManageSpaces && (
            <Link href={`${base}/settings/spaces?new=1`} className={`${rowBase} ${rowTone(false)}`}>
              <Icon name="plus" /> Create social space
            </Link>
          )}
          <NavItem href={`${base}/settings/members`} icon="userPlus" active={pathname.startsWith(`${base}/settings/members`)}>
            {canInvite ? "Invite members" : "Members"}
          </NavItem>
        </div>
        <div className="flex shrink-0 flex-col gap-px border-t border-line px-2.5 py-2">
          <ProductUpdates allHref={`${base}/updates`} />
          <CommunityMenu />
        </div>
      </nav>
    </>
  );
}
