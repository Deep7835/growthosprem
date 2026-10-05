"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["board", "Board"],
  ["table", "Table"],
  ["calendar", "Calendar"],
  ["previews", "Previews"],
  ["notes", "Notes"],
] as const;

export function SpaceTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Views" className="flex gap-1 overflow-x-auto">
      {TABS.map(([slug, label]) => {
        const active = pathname === `${base}/${slug}`;
        return (
          <Link
            key={slug}
            href={`${base}/${slug}`}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${
              active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
