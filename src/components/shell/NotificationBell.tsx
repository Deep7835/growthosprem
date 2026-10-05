"use client";

import Link from "next/link";
import { useRef, useTransition } from "react";

export interface BellItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  when: string;
}

const ICON: Record<string, string> = { publish_failed: "!", publish_reminder: "⏰", published: "✓" };

/** The parts of notifications (PRD 6.18) publishing needs: failures, reminders, published. */
export function NotificationBell({ items, unread, markRead }: { items: BellItem[]; unread: number; markRead: (id?: string) => Promise<void> }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [, start] = useTransition();
  return (
    <details ref={details} className="relative">
      <summary
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-9 cursor-pointer list-none place-items-center rounded-lg hover:bg-subtle"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-[min(380px,90vw)] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
          <strong className="text-sm">Notifications</strong>
          {unread > 0 && (
            <button type="button" onClick={() => start(() => markRead())} className="text-xs font-semibold text-muted hover:text-ink">
              Mark all as read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.</p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-line-soft overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className={n.read ? "" : "bg-accent-bg/40"}>
                <Link
                  href={n.href ?? "#"}
                  onClick={() => {
                    if (details.current) details.current.open = false;
                    if (!n.read) start(() => markRead(n.id));
                  }}
                  className="flex gap-3 px-4 py-3 hover:bg-subtle"
                >
                  <span
                    aria-hidden
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${n.kind === "publish_failed" ? "bg-danger-bg text-danger" : n.kind === "published" ? "bg-success-bg text-success-ink" : "bg-data-bg text-data"}`}
                  >
                    {ICON[n.kind] ?? "•"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-[13px] text-muted">{n.body}</span>}
                    <span className="block text-xs text-muted">{n.when}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
