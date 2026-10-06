"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { HEAT_EMPTY, HEAT_RAMP, PLATFORM_COLOR } from "@/lib/analytics/colors";
import type { Group, HeatCell, Report } from "@/lib/analytics/report";
import { PLATFORM_NAMES } from "@/lib/placements";

const num = (n: number) => Math.round(n).toLocaleString("en-IN");
const rate = (x: number) => `${(x * 100).toFixed(1)}%`;

/* ---------- Tooltip shared by every chart (values lead, labels follow) ---------- */

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (target: Element, value: string, label: string) => {
    const box = ref.current?.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (box) setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, value, label });
  };
  const bind = (value: string, label: string) => ({
    onPointerEnter: (e: React.PointerEvent) => show(e.currentTarget, value, label),
    onFocus: (e: React.FocusEvent) => show(e.currentTarget, value, label),
    onPointerLeave: () => setTip(null),
    onBlur: () => setTip(null),
    tabIndex: 0,
    "aria-label": `${label}: ${value}`,
  });
  const layer = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-white shadow-lg"
      style={{ left: tip.x, top: tip.y - 6 }}
    >
      <strong className="block text-sm">{tip.value}</strong>
      <span className="text-xs text-white/75">{tip.label}</span>
    </div>
  ) : null;
  return { ref, bind, layer, setTip };
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg bg-ground p-[3px]">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`h-7 rounded-md px-2.5 text-[13px] font-semibold ${value === v ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ---------- Engagement rate by platform: vertical bars on a % axis, value above each ---------- */

export function EngagementByPlatform({ platforms }: { platforms: Report["platforms"] }) {
  const { ref, bind, layer } = useTip();
  const pct = platforms.map((p) => p.engagementRate * 100);
  const { hi, ticks } = niceTicks(0, Math.max(1, ...pct), 4);
  const H = 180;
  return (
    <Card title="Engagement rate by platform" subtitle="Average per post in this period">
      <div ref={ref} className="relative">
        <div className="grid grid-cols-[40px_1fr] gap-2">
          <div className="relative" style={{ height: H }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2 text-[11px] text-faint" style={{ top: H - (t / hi) * H }}>
                {t}%
              </span>
            ))}
          </div>
          <div className="relative" style={{ height: H }}>
            {ticks.map((t) => (
              <span key={t} aria-hidden className="absolute inset-x-0 border-t border-line-soft" style={{ top: H - (t / hi) * H }} />
            ))}
            <div className="absolute inset-0 flex items-end justify-around gap-3 px-2">
              {platforms.map((p, i) => (
                <div key={p.accountId} className="group flex h-full max-w-[120px] flex-1 flex-col justify-end rounded-t-md hover:bg-line-soft/60">
                  <span className="mb-1 text-center text-xs font-semibold">{p.posts ? rate(p.engagementRate) : "—"}</span>
                  <div
                    {...bind(rate(p.engagementRate), `${PLATFORM_NAMES[p.platform]} · ${p.posts} post${p.posts === 1 ? "" : "s"}`)}
                    className="mx-auto w-3/4 rounded-t outline-offset-2 group-hover:opacity-85"
                    style={{ height: `${Math.max(1, (pct[i] / hi) * 100)}%`, background: PLATFORM_COLOR[p.platform] }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="ml-[48px] mt-1.5 flex justify-around gap-3 px-2 text-xs text-ink-2">
          {platforms.map((p) => (
            <span key={p.accountId} className="max-w-[120px] flex-1 text-center">
              {PLATFORM_NAMES[p.platform]}
            </span>
          ))}
        </div>
        {layer}
      </div>
    </Card>
  );
}

/* ---------- Contribution by platform: a donut or bars, with a legend that carries the numbers ---------- */

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const pt = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x1, y1] = pt(from);
  const [x2, y2] = pt(to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
}

export function Contribution({ contribution }: { contribution: Report["contribution"] }) {
  const [metric, setMetric] = useState<keyof Report["contribution"]>("engagement");
  const [chart, setChart] = useState<"donut" | "bars">("donut");
  const { ref, bind, layer } = useTip();
  const parts = contribution[metric].filter((c) => c.value > 0);
  const max = Math.max(1, ...parts.map((c) => c.value));
  let angle = 0;
  return (
    <Card
      title="Contribution by platform"
      subtitle="Share of the total across connected accounts"
      action={
        <span className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            Metric
            <select value={metric} onChange={(e) => setMetric(e.target.value as keyof Report["contribution"])} className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] font-semibold text-ink">
              <option value="engagement">Engagement</option>
              <option value="views">Views</option>
              <option value="followers">Followers</option>
            </select>
          </label>
          <Segmented
            label="Chart"
            value={chart}
            onChange={setChart}
            options={[
              ["donut", "Donut"],
              ["bars", "Bars"],
            ]}
          />
        </span>
      }
    >
      <div ref={ref} className="relative flex flex-col items-center gap-4">
        {parts.length === 0 ? (
          <p className="self-start text-sm text-muted">No {metric} in this period.</p>
        ) : chart === "donut" ? (
          <svg viewBox="0 0 200 200" className="size-44" role="img" aria-label={`${metric} by platform`}>
            {parts.length === 1 ? (
              <circle cx="100" cy="100" r="72" fill="none" stroke={PLATFORM_COLOR[parts[0].platform]} strokeWidth="34" {...bind(`${num(parts[0].value)} (100%)`, PLATFORM_NAMES[parts[0].platform])} />
            ) : (
              parts.map((c) => {
                const from = angle;
                angle += c.share * Math.PI * 2;
                // A small gap between slices, in the card's colour.
                return <path key={c.platform} d={arc(100, 100, 72, from + 0.02, angle - 0.02)} fill="none" stroke={PLATFORM_COLOR[c.platform]} strokeWidth="34" {...bind(`${num(c.value)} (${Math.round(c.share * 100)}%)`, PLATFORM_NAMES[c.platform])} />;
              })
            )}
            <text x="100" y="96" textAnchor="middle" className="fill-ink text-[22px] font-semibold">
              {num(parts.reduce((a, c) => a + c.value, 0))}
            </text>
            <text x="100" y="116" textAnchor="middle" className="fill-muted text-[11px]">
              total {metric}
            </text>
          </svg>
        ) : (
          <div className="flex h-44 w-full items-end justify-around gap-4 border-b border-line-soft px-4">
            {parts.map((c) => (
              <div key={c.platform} className="flex h-full max-w-[110px] flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-semibold">{num(c.value)}</span>
                <div {...bind(`${num(c.value)} (${Math.round(c.share * 100)}%)`, PLATFORM_NAMES[c.platform])} className="w-3/4 rounded-t outline-offset-2 hover:opacity-85" style={{ height: `${Math.max(2, (c.value / max) * 85)}%`, background: PLATFORM_COLOR[c.platform] }} />
              </div>
            ))}
          </div>
        )}
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          {contribution[metric].map((c) => (
            <li key={c.platform} className="flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-sm" style={{ background: PLATFORM_COLOR[c.platform] }} />
              <span className="text-ink-2">{PLATFORM_NAMES[c.platform]}</span>
              <strong>{num(c.value)}</strong>
              <span className="text-muted">({Math.round(c.share * 100)}%)</span>
            </li>
          ))}
        </ul>
        {layer}
      </div>
    </Card>
  );
}

/* ---------- Follower growth: 2px line, 10% wash, crosshair tooltip ---------- */

function niceTicks(min: number, max: number, count = 4) {
  const span = Math.max(1, max - min);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function FollowerGrowth({ series, subtitle, collectingSince }: { series: Report["followerSeries"]; subtitle: string; collectingSince: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const { lo, hi, ticks } = useMemo(() => {
    const values = series.map((s) => s.followers);
    return niceTicks(Math.min(...values), Math.max(...values));
  }, [series]);

  if (series.length < 2) {
    return (
      <Card title="Follower growth" subtitle={subtitle}>
        <p className="text-sm text-muted">
          Collecting data. Growth charts start from {collectingSince ? dayLabel(collectingSince) : "the connection date"}.
        </p>
      </Card>
    );
  }

  const x = (i: number) => (i / (series.length - 1)) * 100;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100;
  const line = series.map((s, i) => `${x(i)},${y(s.followers)}`).join(" ");
  const point = hover != null ? series[hover] : null;

  return (
    <Card
      title="Follower growth"
      subtitle={collectingSince ? `Collecting data since ${dayLabel(collectingSince)}` : subtitle}
    >
      <div className="grid grid-cols-[56px_1fr] gap-2">
        <div className="relative h-[200px] text-right text-xs text-muted">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>
              {num(t)}
            </span>
          ))}
        </div>
        <div
          ref={plotRef}
          className="relative h-[200px] touch-none"
          role="img"
          aria-label={`Followers from ${num(series[0].followers)} on ${dayLabel(series[0].day)} to ${num(series.at(-1)!.followers)} on ${dayLabel(series.at(-1)!.day)}`}
          onPointerMove={(e) => {
            const box = plotRef.current!.getBoundingClientRect();
            const i = Math.round(((e.clientX - box.left) / box.width) * (series.length - 1));
            setHover(Math.min(series.length - 1, Math.max(0, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {ticks.map((t) => (
              <line key={t} x1="0" x2="100" y1={y(t)} y2={y(t)} stroke="#efeee8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <polygon points={`0,100 ${line} 100,100`} fill="#2a78d6" fillOpacity="0.1" />
            <polyline points={line} fill="none" stroke="#2a78d6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-[#2a78d6]"
            style={{ left: "100%", top: `${y(series.at(-1)!.followers)}%` }}
          />
          {point && (
            <>
              <span aria-hidden className="absolute inset-y-0 w-px bg-ink-2/40" style={{ left: `${x(hover!)}%` }} />
              <span
                aria-hidden
                className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-[#2a78d6]"
                style={{ left: `${x(hover!)}%`, top: `${y(point.followers)}%` }}
              />
              <div
                role="tooltip"
                className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-white shadow-lg"
                style={{ left: `${Math.min(88, Math.max(12, x(hover!)))}%` }}
              >
                <strong className="block text-sm">{num(point.followers)} followers</strong>
                <span className="text-xs text-white/75">{dayLabel(point.day)}</span>
              </div>
            </>
          )}
        </div>
        <span />
        <div className="flex justify-between text-xs text-muted">
          <span>{dayLabel(series[0].day)}</span>
          <span>{dayLabel(series.at(-1)!.day)}</span>
        </div>
      </div>
    </Card>
  );
}

/* ---------- Breakdowns: engagement rate by format or pillar ---------- */

export function Breakdowns({ byFormat, byPillar, byTopic, byHook, posts, tagged }: { byFormat: Group[]; byPillar: Group[]; byTopic: Group[]; byHook: Group[]; posts: number; tagged: number }) {
  const [by, setBy] = useState<"format" | "pillar" | "topic" | "hook">("format");
  const { ref, bind, layer } = useTip();
  const rows = by === "format" ? byFormat : by === "pillar" ? byPillar : by === "topic" ? byTopic : byHook;
  const fromTags = by === "topic" || by === "hook";
  const max = Math.max(...rows.map((r) => r.engagementRate ?? 0), 0.01);
  return (
    <Card
      title="Engagement rate by format, pillar, topic and hook"
      subtitle={`Last 90 days (${posts} posts), so each group has enough posts to compare${fromTags ? `. Topics and hooks come from AI tags (${tagged} of ${posts} tagged).` : ""}`}
      action={
        <Segmented
          label="Breakdown"
          value={by}
          onChange={setBy}
          options={[
            ["format", "Format"],
            ["pillar", "Pillar"],
            ["topic", "Topic"],
            ["hook", "Hook"],
          ]}
        />
      }
    >
      <div ref={ref} className="relative flex flex-col gap-3.5">
        {rows.length === 0 && (
          <p className="text-sm text-muted">
            {fromTags && posts > 0 ? "No AI tags yet. Posts are tagged automatically once AI is set up; it takes a few minutes after an import." : "No posts in the last 90 days."}
          </p>
        )}
        {rows.map((g) => (
          <div key={g.name} className="grid grid-cols-[150px_1fr] items-center gap-3 text-sm">
            <span className="text-ink-2">
              {g.name} <span className="text-xs text-muted">· {g.posts}</span>
            </span>
            {g.engagementRate == null ? (
              <span className="text-xs text-muted">Not enough posts to compare yet</span>
            ) : (
              <div className="flex items-center gap-2">
                <div
                  {...bind(rate(g.engagementRate), `${g.name} · ${g.posts} posts`)}
                  className="h-4 rounded-r bg-[#2a78d6] outline-offset-2 hover:opacity-85"
                  style={{ width: `${(g.engagementRate / max) * 80}%` }}
                />
                <span className="font-semibold">{rate(g.engagementRate)}</span>
              </div>
            )}
          </div>
        ))}
        {layer}
      </div>
    </Card>
  );
}

/* ---------- Day-and-time heatmap (sequential blue) ---------- */

const SLOT_LABEL = { morning: "7 AM–12 PM", afternoon: "12–5 PM", evening: "5–9 PM", night: "9 PM–7 AM" } as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const { ref, bind, layer } = useTip();
  const rates = cells.map((c) => c.engagementRate).filter((r): r is number => r != null);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  const step = (r: number) => Math.min(HEAT_RAMP.length - 1, Math.floor(((r - lo) / (hi - lo || 1)) * HEAT_RAMP.length));
  const best = cells.filter((c) => c.engagementRate != null && c.posts >= 2).sort((a, b) => b.engagementRate! - a.engagementRate!)[0];
  const slots = ["morning", "afternoon", "evening", "night"] as const;

  return (
    <Card title="Best time to post" subtitle="Average engagement rate by day and time, last 90 days">
      <div ref={ref} className="relative flex flex-col gap-1">
        <div className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))] gap-1 text-[11px] font-semibold text-muted">
          <span />
          {slots.map((s) => (
            <span key={s}>{SLOT_LABEL[s]}</span>
          ))}
        </div>
        {DAYS.map((d, weekday) => (
          <div key={d} className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))] items-center gap-1">
            <span className="text-xs font-semibold text-muted">{d}</span>
            {slots.map((slot) => {
              const c = cells.find((x) => x.weekday === weekday && x.slot === slot)!;
              return (
                <div
                  key={slot}
                  {...bind(
                    c.engagementRate == null ? "No posts" : rate(c.engagementRate),
                    `${FULL_DAYS[weekday]}, ${SLOT_LABEL[slot]} · ${c.posts} post${c.posts === 1 ? "" : "s"}`,
                  )}
                  className="h-7 rounded outline-offset-1 hover:ring-2 hover:ring-ink/30"
                  style={{ background: c.engagementRate == null ? HEAT_EMPTY : HEAT_RAMP[step(c.engagementRate)] }}
                />
              );
            })}
          </div>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Lower</span>
          {HEAT_RAMP.map((c) => (
            <span key={c} aria-hidden className="h-3 w-5 rounded-sm" style={{ background: c }} />
          ))}
          <span>Higher</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-5 rounded-sm" style={{ background: HEAT_EMPTY }} /> No posts
          </span>
          {best && (
            <strong className="ml-auto text-ink">
              Best: {FULL_DAYS[best.weekday]}, {SLOT_LABEL[best.slot]}
            </strong>
          )}
        </div>
        {layer}
      </div>
    </Card>
  );
}
