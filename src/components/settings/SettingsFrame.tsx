"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { SETTINGS_RETURN_KEY } from "@/lib/shell";

export interface FrameSpace {
  slug: string;
  name: string;
  avatarColor: string;
}

type Item = { href: string; label: string; icon: IconName };

/**
 * Settings in one window over the app (from the sidebar gear): Profile, Organisation and each
 * social space down the left, the section's pages on the right. Every page keeps its own URL.
 */
export function SettingsFrame({
  orgSlug,
  user,
  spaces,
  manageOrg,
  children,
}: {
  orgSlug: string;
  user: { name: string; email: string };
  spaces: FrameSpace[];
  /** Owners and Admins: Spaces, Branding, Billing and AI usage. */
  manageOrg: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const frame = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const base = `/o/${orgSlug}`;

  const profile: Item[] = [
    { href: `${base}/settings/profile`, label: "Profile", icon: "users" },
    { href: `${base}/settings/notifications`, label: "Notifications", icon: "bell" },
    { href: `${base}/settings/integrations`, label: "Integrations", icon: "link" },
  ];
  const org: Item[] = [
    { href: `${base}/settings/general`, label: "General", icon: "home" },
    { href: `${base}/settings/members`, label: "Members", icon: "userPlus" },
    ...(manageOrg ? [{ href: `${base}/settings/spaces`, label: "Spaces", icon: "board" } as Item] : []),
    { href: `${base}/settings/tags`, label: "Tags", icon: "tag" },
    ...(manageOrg
      ? ([
          { href: `${base}/settings/branding`, label: "Branding", icon: "palette" },
          { href: `${base}/settings/billing`, label: "Billing", icon: "card" },
          { href: `${base}/settings/ai`, label: "AI usage", icon: "sparkles" },
        ] as Item[])
      : []),
  ];

  const spaceMatch = pathname.match(new RegExp(`^${base}/s/([^/]+)/settings`));
  const section = spaceMatch ? "space" : profile.some((i) => pathname.startsWith(i.href)) ? "profile" : "org";

  // Printable invoices open as their own page, outside the window.
  const plain = pathname.includes("/billing/invoices/");

  const close = () => {
    let back: string | null = null;
    try {
      back = sessionStorage.getItem(SETTINGS_RETURN_KEY);
    } catch {}
    router.push(back?.startsWith(`${base}/`) ? back : `${base}/overview`);
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  // Esc closes the window, unless a dialog inside it is open (that dialog handles its own Esc).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || frame.current?.querySelector(".fixed.inset-0")) return;
      closeRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const link = (i: Item) => {
    const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
    return (
      <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] ${active ? "bg-select font-medium text-ink" : "text-ink-2 hover:bg-line-soft hover:text-ink"}`}>
        <Icon name={i.icon} />
        {i.label}
      </Link>
    );
  };
  const q = query.trim().toLowerCase();
  const shownSpaces = spaces.filter((s) => !q || s.name.toLowerCase().includes(q));
  const allItems = [...profile, ...org, ...spaces.map((s) => ({ href: `${base}/s/${s.slug}/settings/space`, label: s.name, icon: "board" as IconName }))];
  const current = allItems.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) ?? (spaceMatch ? allItems.find((i) => i.href.includes(`/s/${spaceMatch[1]}/`)) : undefined);

  if (plain) return <>{children}</>;

  return (
    <div ref={frame} className="fixed inset-0 z-40 flex bg-ink/45 sm:p-4 lg:p-6">
      <div role="dialog" aria-modal="true" aria-label="Settings" className="flex h-full w-full overflow-hidden bg-surface shadow-2xl sm:rounded-2xl">
        <aside aria-label="Settings sections" className="hidden w-[248px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-subtle px-2.5 py-4 md:flex">
          <div className="flex flex-col gap-px">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Profile</p>
            {profile.map(link)}
          </div>
          <div className="flex flex-col gap-px">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Organisation</p>
            {org.map(link)}
          </div>
          {spaces.length > 0 && (
            <div className="flex flex-col gap-px">
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-faint">Social spaces</p>
              <label className="mb-1 flex h-8 items-center gap-2 rounded-md bg-line-soft px-2 text-muted">
                <Icon name="search" size={14} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search spaces" aria-label="Search spaces" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
              </label>
              {shownSpaces.map((s) => {
                const href = `${base}/s/${s.slug}/settings/space`;
                const active = spaceMatch?.[1] === s.slug;
                return (
                  <Link key={s.slug} href={href} aria-current={active ? "page" : undefined} className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] ${active ? "bg-select font-medium text-ink" : "text-ink-2 hover:bg-line-soft hover:text-ink"}`}>
                    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-[5px] text-[11px] font-bold text-ink" style={{ background: s.avatarColor }}>
                      {s.name[0]}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </Link>
                );
              })}
              {shownSpaces.length === 0 && <p className="px-2 text-[13px] text-muted">No spaces match.</p>}
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-line px-4 py-2.5 sm:px-6">
            {section === "profile" ? (
              <>
                <Avatar name={user.name} color="#F2A93B" size={36} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[17px]">{user.name}</b>
                  <span className="block truncate text-[13px] text-muted">{user.email}</span>
                </span>
              </>
            ) : (
              <span className="min-w-0 flex-1">
                <b className="block text-[17px]">{section === "space" ? "Social spaces" : "Organisation"}</b>
                <span className="block text-[13px] text-muted">{section === "space" ? "Manage settings for each social space in your organisation." : "Manage organisation settings and shared configuration."}</span>
              </span>
            )}
            <button type="button" onClick={close} aria-label="Close settings" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink">
              <Icon name="x" size={18} />
            </button>
          </header>
          {/* Phones: the sections as a menu. */}
          <div className="border-b border-line px-4 py-2 md:hidden">
            <label className="sr-only" htmlFor="settings-section">
              Settings section
            </label>
            <select id="settings-section" value={current?.href ?? ""} onChange={(e) => router.push(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm">
              <optgroup label="Profile">
                {profile.map((i) => (
                  <option key={i.href} value={i.href}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Organisation">
                {org.map((i) => (
                  <option key={i.href} value={i.href}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
              {spaces.length > 0 && (
                <optgroup label="Social spaces">
                  {spaces.map((s) => (
                    <option key={s.slug} value={`${base}/s/${s.slug}/settings/space`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
