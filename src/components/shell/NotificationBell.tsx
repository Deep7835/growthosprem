"use client";

import Link from "next/link";
import { useRef, useTransition } from "react";
import { TypeIcon } from "@/components/notifications/TypeIcon";
import type { NotificationType } from "@/lib/notifications";

export interface BellItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  when: string;
}

/** The latest notifications (PRD 6.18) from the top bar; the full list is on the Notifications page. */
export function NotificationBell({ items, unread, markRead, allHref }: { items: BellItem[]; unread: number; markRead: (id?: string) => Promise<void>; allHref: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [, start] = useTransition();
  const close = () => {
    if (details.current) details.current.open = false;
  };
  return (
    <details ref={details} className="relative">
      <summary
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-8 cursor-pointer list-none place-items-center rounded-md text-white/75 hover:bg-white/10 hover:text-white"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-bar">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-[min(380px,90vw)] text-ink overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
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
                    close();
                    if (!n.read) start(() => markRead(n.id));
                  }}
                  className="flex gap-3 px-4 py-3 hover:bg-subtle"
                >
                  <TypeIcon type={n.type} size={26} />
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
        <Link href={allHref} onClick={close} className="block border-t border-line-soft px-4 py-2.5 text-center text-sm font-semibold hover:bg-subtle">
          See all notifications
        </Link>
      </div>
    </details>
  );
}
