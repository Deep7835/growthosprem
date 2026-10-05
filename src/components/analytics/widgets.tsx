"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { SourceLabel, buttonClass } from "@/components/ui";
import type { Report } from "@/lib/analytics/report";
import { PLATFORM_NAMES } from "@/lib/placements";

const num = (n: number) => Math.round(n).toLocaleString("en-IN");
const rate = (x: number) => `${(x * 100).toFixed(1)}%`;

/* ---------- Overview cards with definitions (AN-02) ---------- */

const DEFINITIONS = {
  engagement: "Likes + comments + saves + shares on posts published in the period.",
  engagementRate: "Average of the post-level engagement rates (engagement ÷ reach) of posts published in the period.",
  views: "Plays or views as reported by each platform.",
  followers: "Followers at the end of the period, from our daily snapshots.",
  followerGrowth: "Followers at the end of the period minus followers at the start, from our daily snapshots.",
  posts: "Posts published in the period on the selected platforms.",
} as const;

type Delta = { text: string; up: boolean } | null;

function percentDelta(value: number, previous: number | null): Delta {
  if (previous == null || previous === 0) return null;
  const change = (value - previous) / previous;
  return { text: `${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}%`, up: change >= 0 };
}

export function KpiTiles({ kpis, days, compare }: { kpis: Report["kpis"]; days: number; compare: boolean }) {
  const [open, setOpen] = useState<keyof typeof DEFINITIONS | null>(null);
  const er = kpis.engagementRate;
  const erDelta: Delta =
    er.previous == null ? null : { text: `${er.value >= er.previous ? "+" : "−"}${Math.abs((er.value - er.previous) * 100).toFixed(1)} pts`, up: er.value >= er.previous };
  const postsDelta: Delta =
    kpis.posts.previous == null ? null : { text: `${kpis.posts.value >= kpis.posts.previous ? "+" : "−"}${Math.abs(kpis.posts.value - kpis.posts.previous)}`, up: kpis.posts.value >= kpis.posts.previous };
  const followersDelta: Delta =
    kpis.followers.start == null || kpis.followers.start === 0
      ? null
      : {
          text: `${kpis.followers.value >= kpis.followers.start ? "+" : "−"}${Math.abs(((kpis.followers.value - kpis.followers.start) / kpis.followers.start) * 100).toFixed(1)}%`,
          up: kpis.followers.value >= kpis.followers.start,
        };

  const tiles: { key: keyof typeof DEFINITIONS; label: string; value: string; delta: Delta; note?: string }[] = [
    { key: "engagement", label: "Engagement", value: num(kpis.engagement.value), delta: percentDelta(kpis.engagement.value, kpis.engagement.previous) },
    { key: "engagementRate", label: "Engagement rate", value: rate(er.value), delta: erDelta },
    { key: "views", label: "Views", value: num(kpis.views.value), delta: percentDelta(kpis.views.value, kpis.views.previous) },
    { key: "followers", label: "Followers", value: num(kpis.followers.value), delta: followersDelta, note: "this period" },
    {
      key: "followerGrowth",
      label: "Follower growth",
      value: kpis.followerGrowth == null ? "—" : `${kpis.followerGrowth >= 0 ? "+" : "−"}${num(Math.abs(kpis.followerGrowth))}`,
      delta: null,
      note: kpis.followerGrowth == null ? "collecting data" : "this period",
    },
    { key: "posts", label: "Posts", value: String(kpis.posts.value), delta: postsDelta },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      {tiles.map((t) => (
        <div key={t.key} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-muted">{t.label}</span>
            <button
              type="button"
              aria-expanded={open === t.key}
              aria-label={`What does ${t.label} mean?`}
              onClick={() => setOpen(open === t.key ? null : t.key)}
              className="grid size-[22px] place-items-center rounded-full border border-line text-[11px] font-bold text-muted hover:text-ink"
            >
              i
            </button>
          </div>
          <span className="text-[28px] font-semibold leading-tight">{t.value}</span>
          {(compare || t.key === "followers") && t.delta ? (
            <span className={`text-[13px] font-semibold ${t.delta.up ? "text-success" : "text-danger"}`}>
              <span aria-hidden>{t.delta.up ? "▲" : "▼"}</span> {t.delta.text}{" "}
              <span className="font-normal text-muted">{t.key === "followers" ? "this period" : `vs previous ${days} days`}</span>
            </span>
          ) : (
            t.note && <span className="text-[13px] text-muted">{t.note}</span>
          )}
          {open === t.key && <p className="border-t border-line-soft pt-2 text-xs leading-relaxed text-ink-2">{DEFINITIONS[t.key]}</p>}
        </div>
      ))}
    </div>
  );
}

/* ---------- What happened, why, what next (AN-09) ---------- */

export function InsightsPanel({
  insights,
  addedToPlan,
  canEdit,
  auditHref,
  toggleRecommendation,
}: {
  insights: Report["insights"];
  addedToPlan: string[];
  canEdit: boolean;
  auditHref: string;
  toggleRecommendation: (key: string) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const [added, setAdded] = useOptimistic(addedToPlan.includes(insights.next?.key ?? ""));
  const [error, setError] = useState<string | null>(null);
  const next = insights.next;

  return (
    <section aria-label="AI insights" className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-[22px] font-bold">
          <span className="grid size-[30px] place-items-center rounded-[9px] bg-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
            </svg>
          </span>
          What happened, why, what next
        </h2>
        <span className="text-xs text-muted">Numbers are computed from your data, never estimated.</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
        <div className="flex flex-col gap-2 rounded-xl bg-subtle p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">What happened</span>
          <p className="text-[15px] leading-normal">{insights.happened}</p>
          <span className="flex items-center gap-2">
            <SourceLabel kind="data" />
            <span className="text-xs text-muted">Daily snapshots</span>
          </span>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-subtle p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Why</span>
          {insights.why.length === 0 && <p className="text-[15px] text-muted">Not enough posts yet to explain why.</p>}
          {insights.why.map((w) => (
            <div key={w.text} className="flex flex-col gap-1.5">
              <p className="text-[15px] leading-normal">{w.text}</p>
              <span className="flex items-center gap-2">
                <SourceLabel kind="data" />
                <span className="text-xs text-muted">{w.sample}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-subtle p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">What next</span>
          {next ? (
            <>
              <p className="text-[15px] font-semibold leading-normal">{next.title}</p>
              <p className="text-sm leading-normal text-ink-2">{next.rationale}</p>
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-ai-bg px-2 py-0.5 text-[11px] font-semibold text-ai">Suggestion</span>
                <span className="text-xs text-muted">{next.sample}</span>
              </span>
              <div className="mt-1 flex flex-wrap gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        setAdded(!added);
                        try {
                          setError(null);
                          await toggleRecommendation(next.key);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Could not update the plan.");
                        }
                      })
                    }
                    className={`${buttonClass(added ? "secondary" : "primary", "sm")} ${added ? "border-[#9FCFB4] bg-success-bg text-success-ink" : ""}`}
                  >
                    {added ? "Added to plan" : "Add to plan"}
                  </button>
                )}
                <Link href={auditHref} className={buttonClass("secondary", "sm")}>
                  Create posts
                </Link>
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
            </>
          ) : (
            <p className="text-[15px] text-muted">Keep posting. Suggestions appear once there are enough posts to compare.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Top and lowest performing content (AN-05) ---------- */

type Post = Report["posts"][number];
const FORMAT = { reel: "Reel", carousel: "Carousel", post: "Post", story: "Story" } as const;
const RANK_BY = { views: "Views", engagementRate: "Engagement rate", saves: "Saves", shares: "Shares" } as const;

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export function TopContent({ posts }: { posts: Post[] }) {
  const [list, setList] = useState<"top" | "low">("top");
  const [by, setBy] = useState<keyof typeof RANK_BY>("views");
  const ranked = useMemo(() => {
    const sorted = [...posts].sort((a, b) => b[by] - a[by]);
    return list === "top" ? sorted.slice(0, 5) : sorted.reverse().slice(0, 3);
  }, [posts, list, by]);

  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Content ranking" className="flex gap-0.5 rounded-lg bg-ground p-[3px]">
          {(["top", "low"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={list === l}
              onClick={() => setList(l)}
              className={`h-8 rounded-md px-3 text-sm font-semibold ${list === l ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {l === "top" ? "Top performing" : "Lowest performing"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Ranked by
          <select value={by} onChange={(e) => setBy(e.target.value as keyof typeof RANK_BY)} className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] font-semibold text-ink">
            {Object.entries(RANK_BY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {ranked.length === 0 ? (
        <p className="text-sm text-muted">No posts in this period.</p>
      ) : (
        <ol className="flex flex-col">
          {ranked.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3.5 border-t border-line-soft py-3">
              <span className="w-7 font-display text-lg font-bold text-muted">#{i + 1}</span>
              <span className="grid size-12 place-items-center rounded-[10px] bg-ground font-display text-xl font-bold text-ink-2">{p.title[0]}</span>
              <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <strong className="text-[15px]">{p.title}</strong>
                <span className="text-xs text-muted">
                  {PLATFORM_NAMES[p.platform]} {FORMAT[p.format]} · {shortDate(p.publishedAt)}
                </span>
              </div>
              <dl className="grid grid-cols-[repeat(4,minmax(72px,auto))] gap-4 text-[13px]">
                {[
                  ["Views", num(p.views)],
                  ["Likes", num(p.likes)],
                  ["Comments", num(p.comments)],
                  [by === "saves" ? "Saves" : by === "shares" ? "Shares" : "Eng. rate", by === "saves" ? num(p.saves) : by === "shares" ? num(p.shares) : rate(p.engagementRate)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <dt className="text-[11px] text-muted">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ---------- All posts in the period, sortable and filterable (AN-06) ---------- */

const COLUMNS = [
  ["publishedAt", "Published"],
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["saves", "Saves"],
  ["shares", "Shares"],
  ["engagementRate", "Eng. rate"],
] as const;
type SortKey = (typeof COLUMNS)[number][0];

export function ContentTable({ posts }: { posts: Post[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "publishedAt", desc: true });
  const [format, setFormat] = useState("all");
  const [pillar, setPillar] = useState("all");
  const pillars = [...new Set(posts.map((p) => p.pillar).filter(Boolean) as string[])].sort();
  const formats = [...new Set(posts.map((p) => p.format))];

  const value = (p: Post) => (sort.key === "publishedAt" ? Date.parse(p.publishedAt) : p[sort.key]);
  const rows = posts
    .filter((p) => (format === "all" || p.format === format) && (pillar === "all" || p.pillar === pillar))
    .sort((a, b) => (sort.desc ? value(b) - value(a) : value(a) - value(b)));

  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">
          All posts in this period <span className="font-normal text-muted">· {rows.length}</span>
        </h2>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <label className="flex items-center gap-1.5 text-muted">
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 font-semibold text-ink">
              <option value="all">All</option>
              {formats.map((f) => (
                <option key={f} value={f}>
                  {FORMAT[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-muted">
            Pillar
            <select value={pillar} onChange={(e) => setPillar(e.target.value)} className="h-8 rounded-lg border border-line bg-surface px-2 font-semibold capitalize text-ink">
              <option value="all">All</option>
              {pillars.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-subtle text-xs font-semibold text-muted">
            <tr>
              <th className="px-3 py-2.5">Post</th>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className="px-3 py-2.5 text-right" aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
                    className="font-semibold hover:text-ink"
                  >
                    {label} {sort.key === key ? (sort.desc ? "↓" : "↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line-soft">
                <td className="px-3 py-2.5">
                  <span className="block font-semibold">{p.title}</span>
                  <span className="text-xs capitalize text-muted">
                    {PLATFORM_NAMES[p.platform]} {FORMAT[p.format]} · {p.pillar}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{shortDate(p.publishedAt)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(p.views)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(p.likes)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(p.comments)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(p.saves)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(p.shares)}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rate(p.engagementRate)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">
                  No posts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- Data freshness and manual refresh (AN-10) ---------- */

export function Freshness({ updatedText, refresh }: { updatedText: string; refresh: () => Promise<{ error?: string }> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
      <span>{updatedText}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await refresh();
            setMessage(result.error ?? null);
          })
        }
        className={buttonClass("secondary", "sm")}
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
      {message && (
        <span role="status" className="w-full text-xs text-warn-ink">
          {message}
        </span>
      )}
    </div>
  );
}
