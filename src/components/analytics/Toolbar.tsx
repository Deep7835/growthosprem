"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { menuItem, Popover } from "@/components/Popover";
import { PlatformLogo, buttonClass } from "@/components/ui";
import type { Report } from "@/lib/analytics/report";
import { PLATFORM_NAMES, type Platform } from "@/lib/placements";

/** "All platforms" or one platform, as a menu (connected ones only can be picked). */
export function PlatformMenu({ current, options }: { current: Platform | "all"; options: { platform: Platform | "all"; href: string; connected: boolean }[] }) {
  return (
    <Popover
      label="Platform"
      buttonClassName={`${buttonClass("secondary", "sm")} h-9 gap-2`}
      panelClassName="left-0 top-full mt-1 w-56"
      button={
        <>
          {current === "all" ? <Icon name="chart" size={15} /> : <PlatformLogo platform={current} size={16} />}
          {current === "all" ? "All platforms" : PLATFORM_NAMES[current]}
          <Icon name="chevronDown" size={14} className="text-muted" />
        </>
      }
    >
      {(close) => (
        <div className="flex flex-col">
          {options.map((o) =>
            o.connected ? (
              <Link key={o.platform} href={o.href} scroll={false} onClick={close} className={menuItem}>
                {o.platform === "all" ? <Icon name="chart" size={15} /> : <PlatformLogo platform={o.platform} size={16} />}
                <span className="flex-1">{o.platform === "all" ? "All platforms" : PLATFORM_NAMES[o.platform]}</span>
                {o.platform === current && <Icon name="check" size={14} />}
              </Link>
            ) : (
              <span key={o.platform} className={`${menuItem} cursor-default opacity-50 hover:bg-transparent`} title="Not connected">
                {o.platform !== "all" && <PlatformLogo platform={o.platform} size={16} />}
                <span className="flex-1">{o.platform === "all" ? "All platforms" : PLATFORM_NAMES[o.platform]}</span>
                <span className="text-[11px]">Not connected</span>
              </span>
            ),
          )}
        </div>
      )}
    </Popover>
  );
}

/** The date range as a button showing the period, with the ranges in its menu. */
export function RangeMenu({ period, options }: { period: string; options: { days: number; href: string; active: boolean }[] }) {
  return (
    <Popover label="Date range" buttonClassName={`${buttonClass("secondary", "sm")} h-9 gap-2`} panelClassName="right-0 top-full mt-1 w-48" button={<><Icon name="calendar" size={15} /> {period}</>}>
      {(close) => (
        <div className="flex flex-col">
          {options.map((o) => (
            <Link key={o.days} href={o.href} scroll={false} onClick={close} className={menuItem}>
              <span className="flex-1">Last {o.days} days</span>
              {o.active && <Icon name="check" size={14} />}
            </Link>
          ))}
        </div>
      )}
    </Popover>
  );
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Reports: the period's posts as a spreadsheet, or the page printed or saved as PDF. */
export function ReportsMenu({ posts, filename }: { posts: Report["posts"]; filename: string }) {
  const download = () => {
    const head = ["Published", "Platform", "Format", "Title", "Views", "Reach", "Likes", "Comments", "Saves", "Shares", "Engagement rate", "Pillar", "Link"];
    const rows = posts.map((p) => [p.publishedAt.slice(0, 10), PLATFORM_NAMES[p.platform], p.format, p.title, p.views, p.reach, p.likes, p.comments, p.saves, p.shares, `${(p.engagementRate * 100).toFixed(1)}%`, p.pillar ?? "", p.permalink ?? ""]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Popover label="Reports" buttonClassName={`${buttonClass("secondary", "sm")} h-9 gap-1.5`} panelClassName="right-0 top-full mt-1 w-60" button={<><Icon name="clipboard" size={15} /> Reports</>}>
      {(close) => (
        <div className="flex flex-col">
          <button
            type="button"
            disabled={posts.length === 0}
            onClick={() => {
              close();
              download();
            }}
            className={`${menuItem} disabled:opacity-50`}
          >
            <Icon name="download" /> Download posts (CSV)
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              window.print();
            }}
            className={menuItem}
          >
            <Icon name="image" /> Print or save as PDF
          </button>
        </div>
      )}
    </Popover>
  );
}
