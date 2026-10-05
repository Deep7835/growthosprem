"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Organisation overview: Dashboard and Calendar (PRD 6.2). */
export function OverviewTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    [`${base}/overview`, "Dashboard"],
    [`${base}/overview/calendar`, "Calendar"],
  ] as const;
  return (
    <nav aria-label="Overview" className="flex gap-1 border-b border-line bg-surface px-6">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${pathname === href ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
