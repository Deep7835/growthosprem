"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Popover } from "@/components/Popover";
import { toast } from "@/components/Toaster";
import { buttonClass } from "@/components/ui";
import type { NotificationType } from "@/lib/notifications";
import { TypeIcon } from "./TypeIcon";

export interface CenterItem {
  id: string;
  kind: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  space: { name: string; color: string } | null;
  when: string;
  at: string;
  day: string;
}

type Filters = { tab: "primary" | "cleared"; q: string; types: string[]; spaces: string[]; unread: boolean; limit: number };

const SUMMARY_PROMPT = "Summarize my recent notifications and tell me if there are any actions I need to take.";
type Change = { ids: string[] | "all"; read?: boolean; cleared?: boolean };

/** NT-01: Primary and Cleared tabs, search, filters by type and space, read, clear and clear all. */
export function NotificationCenter(props: {
  org: string;
  filters: Filters;
  counts: { primary: number; unread: number; cleared: number };
  /** How many of each type the other filters leave. */
  typeCounts: Partial<Record<NotificationType, number>>;
  more: boolean;
  types: { id: NotificationType; label: string }[];
  spaces: { id: string; name: string; color: string }[];
  items: CenterItem[];
  setRead: (ids: string[] | "all", read: boolean) => Promise<void>;
  setCleared: (ids: string[] | "all", cleared: boolean) => Promise<void>;
  deleteCleared: () => Promise<void>;
}) {
  const { filters, counts } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [items, apply] = useOptimistic(props.items, (list: CenterItem[], c: Change) =>
    list
      .filter((n) => c.cleared === undefined || !(c.ids === "all" || c.ids.includes(n.id)))
      .map((n) => (c.read !== undefined && (c.ids === "all" || c.ids.includes(n.id)) ? { ...n, read: c.read } : n)),
  );

  const go = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.tab === "cleared") params.set("tab", "cleared");
    if (next.q) params.set("q", next.q);
    if (next.types.length) params.set("type", next.types.join(","));
    if (next.spaces.length) params.set("space", next.spaces.join(","));
    if (next.unread) params.set("unread", "1");
    if (patch.limit) params.set("limit", String(next.limit));
    const s = params.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (q.trim() === filters.q) return;
    const t = setTimeout(() => go({ q: q.trim() }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const change = (c: Change, run: () => Promise<void>, text?: string, undo?: () => Promise<void>) =>
    start(async () => {
      apply(c);
      await run();
      if (text) setNotice({ text, undo: undo && (() => start(async () => { await undo(); setNotice(null); })) });
    });

  const cleared = filters.tab === "cleared";
  const filtered = Boolean(filters.q || filters.types.length || filters.spaces.length || filters.unread);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const [spaceQuery, setSpaceQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const unreadShown = items.filter((n) => !n.read).length;
  // With filters on, the bulk buttons act on what's shown.
  const scope: string[] | "all" = filtered ? items.map((n) => n.id) : "all";
  const groups: [string, CenterItem[]][] = [];
  for (const n of items) {
    const last = groups[groups.length - 1];
    if (last && last[0] === n.day) last[1].push(n);
    else groups.push([n.day, [n]]);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6 pb-14">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Notifications</h1>
          <p className="text-sm text-muted">{counts.unread ? `${counts.unread} unread` : "Nothing unread"}</p>
        </div>
        <Link href={`/o/${props.org}/settings/notifications`} className={buttonClass("secondary", "sm")}>
          Notification settings
        </Link>
      </header>

      <div role="tablist" aria-label="Notifications" className="flex gap-1 border-b border-line">
        {(
          [
            ["primary", "Primary", counts.unread],
            ["cleared", "Cleared", counts.cleared],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filters.tab === id}
            onClick={() => go({ tab: id })}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${filters.tab === id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
            {n > 0 && <span className={`rounded-full px-1.5 text-[11px] ${id === "primary" ? "bg-danger text-white" : "bg-subtle text-muted"}`}>{n > 99 ? "99+" : n}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications" aria-label="Search notifications" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <Popover
          label="Filters"
          buttonClassName={`${buttonClass("secondary", "sm")} h-9 gap-1.5`}
          panelClassName="right-0 top-full mt-1 w-[min(420px,90vw)]"
          button={
            <>
              <Icon name="menu" size={15} /> Filters{filters.types.length + filters.spaces.length ? ` · ${filters.types.length + filters.spaces.length}` : ""}
            </>
          }
        >
          {() => (
            <div className="flex flex-col gap-3 p-2">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Types</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {props.types.map((t) => {
                    const on = filters.types.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => go({ types: toggle(filters.types, t.id) })}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px] ${on ? "border-ink bg-subtle font-semibold" : "border-line hover:bg-subtle"}`}
                      >
                        <TypeIcon type={t.id} size={20} />
                        <span className="min-w-0 flex-1 truncate">{t.label}</span>
                        <span className="rounded-full bg-line-soft px-1.5 text-[11px] text-muted">{props.typeCounts[t.id] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Spaces</p>
                {props.spaces.length > 5 && (
                  <input value={spaceQuery} onChange={(e) => setSpaceQuery(e.target.value)} placeholder="Search spaces…" aria-label="Search spaces" className="mb-1.5 h-8 w-full rounded-lg bg-line-soft px-2 text-sm outline-none" />
                )}
                <div className="flex flex-wrap gap-1.5">
                  {[...props.spaces.filter((sp) => !spaceQuery.trim() || sp.name.toLowerCase().includes(spaceQuery.trim().toLowerCase())), { id: "none", name: "Organisation-wide", color: "#E4E3DC" }].map((sp) => {
                    const on = filters.spaces.includes(sp.id);
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => go({ spaces: toggle(filters.spaces, sp.id) })}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] ${on ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:bg-subtle"}`}
                      >
                        <span aria-hidden className="size-2 rounded-full" style={{ background: sp.color }} />
                        {sp.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(filters.types.length > 0 || filters.spaces.length > 0) && (
                <button type="button" onClick={() => go({ types: [], spaces: [] })} className="self-start text-xs font-semibold text-muted hover:text-ink">
                  Clear filters
                </button>
              )}
            </div>
          )}
        </Popover>
        <Link href={`/o/${props.org}/ai?prompt=${encodeURIComponent(SUMMARY_PROMPT)}`} className={`${buttonClass("secondary", "sm")} h-9 gap-1.5 border-accent/60 text-accent-ink`}>
          <Icon name="sparkles" size={15} /> Summarize
        </Link>
        {!cleared && (
          <label className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm">
            <input type="checkbox" checked={filters.unread} onChange={(e) => go({ unread: e.target.checked })} />
            Unread only
          </label>
        )}
      </div>

      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm text-muted">
          {notice ? (
            <>
              {notice.text}
              {notice.undo && (
                <button type="button" onClick={notice.undo} className="ml-2 font-semibold text-ink underline">
                  Undo
                </button>
              )}
            </>
          ) : pending ? (
            "Saving…"
          ) : (
            ""
          )}
        </p>
        {cleared && items.length > 0 && !filtered && (
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-danger">Delete {counts.cleared} cleared notification{counts.cleared === 1 ? "" : "s"} for good?</span>
                <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass("ghost", "sm")}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    change({ ids: "all", cleared: false }, async () => {
                      await props.deleteCleared();
                      setConfirmDelete(false);
                      toast("success", "Cleared notifications deleted");
                    })
                  }
                  className="h-8 rounded-lg bg-danger px-3 text-[13px] font-semibold text-white"
                >
                  Delete
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonClass("secondary", "sm")} gap-1.5 text-danger`}>
                <Icon name="trash" size={14} /> Delete all
              </button>
            )}
          </div>
        )}
        {!cleared && items.length > 0 && (
          <div className="flex gap-2">
            {(filtered ? unreadShown > 0 : counts.unread > 0) && (
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => change({ ids: scope, read: true }, () => props.setRead(scope, true), "Marked as read.")}>
                {filtered ? "Mark these as read" : "Mark all as read"}
              </button>
            )}
            <button
              type="button"
              className={buttonClass("secondary", "sm")}
              onClick={() =>
                change({ ids: scope, cleared: true }, () => props.setCleared(scope, true), "Cleared. You’ll find them in the Cleared tab.", scope === "all" ? undefined : () => props.setCleared(scope, false))
              }
            >
              {filtered ? "Clear these" : "Clear all"}
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          {cleared ? (
            <>
              <strong>{filtered ? "Nothing cleared matches these filters" : "Nothing cleared yet"}</strong>
              <p className="text-sm text-muted">Notifications you clear move here, so you can bring them back.</p>
            </>
          ) : filtered ? (
            <>
              <strong>No notifications match these filters</strong>
              <button type="button" onClick={() => { setQ(""); go({ q: "", types: [], spaces: [], unread: false }); }} className={buttonClass("secondary", "sm")}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <span className="text-3xl" aria-hidden>
                ✓
              </span>
              <strong>You’re all caught up</strong>
              <p className="text-sm text-muted">New comments, approvals and publishing updates will show up here.</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([day, list]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{day}</h2>
              <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
                {list.map((n) => (
                  <li key={n.id} className={`group relative flex gap-3 px-4 py-3 ${n.read ? "" : "bg-accent-bg/40"}`}>
                    <TypeIcon type={n.type} />
                    <div className="min-w-0 flex-1">
                      {n.href ? (
                        <Link
                          href={n.href}
                          onClick={() => {
                            if (!n.read) start(() => props.setRead([n.id], true));
                          }}
                          className={`block text-sm hover:underline ${n.read ? "" : "font-semibold"}`}
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <p className={`text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</p>
                      )}
                      {n.body && <p className="line-clamp-2 text-[13px] text-muted">{n.body}</p>}
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {n.space && (
                          <span className="inline-flex items-center gap-1">
                            <span aria-hidden className="size-2 rounded-sm" style={{ background: n.space.color }} />
                            {n.space.name}
                          </span>
                        )}
                        <span>{props.types.find((t) => t.id === n.type)?.label}</span>
                        <time dateTime={n.at} title={new Date(n.at).toLocaleString("en-IN")}>
                          {n.when}
                        </time>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      {!cleared && (
                        <button
                          type="button"
                          title={n.read ? "Mark as unread" : "Mark as read"}
                          aria-label={`${n.read ? "Mark as unread" : "Mark as read"}: ${n.title}`}
                          onClick={() => change({ ids: [n.id], read: !n.read }, () => props.setRead([n.id], !n.read))}
                          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
                        >
                          <span aria-hidden className={`size-2.5 rounded-full ${n.read ? "border-2 border-line" : "bg-accent"}`} />
                        </button>
                      )}
                      <button
                        type="button"
                        title={cleared ? "Move back to Primary" : "Clear"}
                        aria-label={`${cleared ? "Restore" : "Clear"}: ${n.title}`}
                        onClick={() =>
                          cleared
                            ? change({ ids: [n.id], cleared: false }, () => props.setCleared([n.id], false), "Moved back to Primary.")
                            : change({ ids: [n.id], cleared: true }, () => props.setCleared([n.id], true), "Cleared.", () => props.setCleared([n.id], false))
                        }
                        className={cleared ? buttonClass("ghost", "sm") : "grid size-8 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"}
                      >
                        {cleared ? (
                          "Restore"
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {props.more && (
            <button type="button" onClick={() => go({ limit: filters.limit + 50 })} className={`${buttonClass("secondary", "sm")} self-center`}>
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
