"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Space settings tabs (SP-02). Ones without a path arrive with later milestones.
const TABS = [
  ["Space", null],
  ["Accounts", "settings/accounts"],
  ["Autopost", "settings/autopost"],
  ["Projects", "settings/projects"],
  ["Members", null],
  ["Statuses", "settings/statuses"],
  ["Brand Brain", "brand"],
] as const;

export function SettingsTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map(([label, path]) => {
        if (!path) {
          return (
            <span key={label} title="Coming soon" className="cursor-default whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-faint">
              {label}
            </span>
          );
        }
        const active = pathname === `${base}/${path}`;
        return (
          <Link
            key={label}
            href={`${base}/${path}`}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
