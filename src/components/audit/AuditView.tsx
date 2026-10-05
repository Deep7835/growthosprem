"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { PlacementChip, SourceLabel, buttonClass } from "@/components/ui";
import type { Audit } from "@/lib/analytics/audit";
import { PLATFORM_NAMES, type Platform } from "@/lib/placements";

const FORMAT_LABEL = { reel: "Reel", carousel: "Carousel", post: "Post", story: "Story" } as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const num = (n: number) => Math.round(n).toLocaleString("en-IN");

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function addIsoDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function TrendDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M14 17h7v-7" />
    </svg>
  );
}

function TrendUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function AuditView({
  spaceName,
  periodText,
  isDemo,
  accounts,
  audit,
  addedToPlan,
  onCalendar,
  canEdit,
  boardHref,
  toggleRecommendation,
  addDrafts,
  undoDrafts,
}: {
  spaceName: string;
  periodText: string;
  isDemo: boolean;
  accounts: { id: string; platform: Platform; handle: string; posts: number }[];
  audit: Audit;
  addedToPlan: string[];
  onCalendar: string[];
  canEdit: boolean;
  boardHref: string;
  toggleRecommendation: (key: string) => Promise<void>;
  addDrafts: (keys: string[]) => Promise<string[]>;
  undoDrafts: (ids: string[]) => Promise<void>;
}) {
  const [, startTransition] = useTransition();
  const [added, toggleAdded] = useOptimistic(new Set(addedToPlan), (state, key: string) => {
    const next = new Set(state);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<{ ids: string[]; keys: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const available = audit.plan.filter((p) => !onCalendar.includes(p.key));
  const selected = available.filter((p) => !excluded.has(p.key));
  const working = audit.findings.filter((f) => f.kind === "working");
  const notWorking = audit.findings.filter((f) => f.kind === "not_working");
  const monday = audit.plan.length ? addIsoDays(audit.plan[0].date, -audit.plan[0].weekday) : null;
  const days = monday ? Array.from({ length: 14 }, (_, i) => addIsoDays(monday, i)) : [];

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const kpis = [
    { label: "Followers", value: num(audit.totals.followers), note: "across connected accounts" },
    { label: "Engagement rate", value: `${(audit.totals.engagementRate * 100).toFixed(1)}%`, note: "average per post" },
    { label: "Views", value: num(audit.totals.views), note: "in 90 days" },
    { label: "Posts", value: String(audit.postCount), note: "in 90 days" },
  ];

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-7 p-6 pb-14">
      <div className="flex flex-col gap-2.5">
        {isDemo && (
          <span className="self-start rounded-full border border-dashed border-faint px-2.5 py-0.5 text-xs font-semibold text-muted">
            Sample data · real import starts when Instagram and Facebook are connected
          </span>
        )}
        <h1 className="max-w-[780px] font-display text-[38px] font-bold leading-tight tracking-tight">
          Here’s what 90 days of {spaceName}’s posts tell us
        </h1>
        <p className="max-w-[720px] text-base leading-relaxed text-muted">
          We looked at {audit.postCount} posts from {periodText}. Every number below comes from your accounts, and each suggestion
          shows the evidence behind it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-success">
          <Check /> Import complete
        </span>
        <span className="h-1.5 min-w-[120px] flex-1 rounded-full bg-success" />
        {accounts.map((a) => (
          <span key={a.id}>
            {PLATFORM_NAMES[a.platform]} · {a.posts} posts
          </span>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
            <span className="text-[13px] font-medium text-muted">{k.label}</span>
            <span className="font-display text-3xl font-bold">{k.value}</span>
            <span className="text-[13px] text-muted">{k.note}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        {[
          { title: "What’s working", items: working, tone: "bg-success-bg text-success", icon: <TrendUp />, empty: "Nothing stands out yet." },
          { title: "What’s holding you back", items: notWorking, tone: "bg-warn-bg text-warn-ink", icon: <TrendDown />, empty: "No clear weak spots in this period." },
        ].map((col) => (
          <section key={col.title} className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className={`grid size-7 place-items-center rounded-lg ${col.tone}`}>{col.icon}</span>
              {col.title}
            </h2>
            {col.items.length === 0 && <p className="text-sm text-muted">{col.empty}</p>}
            {col.items.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
                <p className="text-[15px] leading-normal">
                  <strong>{f.head}</strong> {f.text}
                </p>
                <span className="flex items-center gap-2">
                  <SourceLabel kind="data" />
                  <span className="text-xs text-muted">{f.sample}</span>
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>

      {audit.recommendations.length > 0 && (
        <section className="flex flex-col gap-3.5">
          <h2 className="font-display text-2xl font-bold">
            {audit.recommendations.length === 3 ? "Three things to do next" : "What to do next"}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {audit.recommendations.map((r, i) => {
              const isAdded = added.has(r.key);
              return (
                <article key={r.key} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid size-[30px] place-items-center rounded-full bg-accent font-bold">{i + 1}</span>
                    <span className="rounded-full bg-ai-bg px-2 py-0.5 text-[11px] font-semibold text-ai">Suggestion</span>
                  </div>
                  <h3 className="text-lg font-semibold leading-snug">{r.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-2">{r.rationale}</p>
                  <span className="flex items-center gap-2">
                    <SourceLabel kind="data" />
                    <span className="text-xs text-muted">{r.sample}</span>
                  </span>
                  <div className="flex-1" />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          toggleAdded(r.key);
                          await run(() => toggleRecommendation(r.key));
                        })
                      }
                      className={`${buttonClass(isAdded ? "secondary" : "primary")} h-11 ${isAdded ? "border-[#9FCFB4] bg-success-bg text-success-ink hover:bg-success-bg" : ""}`}
                    >
                      {isAdded ? (
                        <>
                          <Check /> Added to plan
                        </>
                      ) : (
                        "Add to plan"
                      )}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {audit.plan.length > 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">Your draft two-week calendar</h2>
              <p className="text-sm text-muted">Built from what works for {spaceName}. Click a post to leave it out.</p>
            </div>
            {canEdit && !created && selected.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const keys = selected.map((p) => p.key);
                  const ids = await run(() => addDrafts(keys));
                  if (ids) setCreated({ ids, keys });
                }}
                className={`${buttonClass("primary")} h-11`}
              >
                {busy ? "Adding…" : `Add ${selected.length} draft${selected.length === 1 ? "" : "s"} to calendar`}
              </button>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {created && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-success-bg px-4 py-3.5 text-success-ink">
              <Check />
              <span className="min-w-[240px] flex-1 font-semibold">
                {created.ids.length} draft{created.ids.length === 1 ? "" : "s"} added to {spaceName}’s Board under “Idea”.
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  await run(() => undoDrafts(created.ids));
                  setCreated(null);
                }}
                className="h-9 rounded-lg border border-[#9FCFB4] px-3 text-sm font-semibold"
              >
                Undo
              </button>
              <Link href={boardHref} className={buttonClass("primary", "sm")}>
                Open the Board →
              </Link>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-line">
            <div className="min-w-[840px]">
              <div className="grid grid-cols-7 border-b border-line bg-subtle text-xs font-semibold text-muted">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="p-2">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day, i) => (
                  <div key={day} className={`flex min-h-[132px] flex-col gap-1.5 border-b border-r border-line-soft p-2 ${i % 7 >= 5 ? "bg-subtle" : "bg-surface"}`}>
                    <span className="text-xs font-semibold text-muted">{shortDate(day)}</span>
                    {audit.plan
                      .filter((p) => p.date === day)
                      .map((p) => {
                        const out = excluded.has(p.key);
                        const scheduled = onCalendar.includes(p.key) || Boolean(created?.keys.includes(p.key));
                        return (
                          <button
                            key={p.key}
                            type="button"
                            aria-pressed={!out}
                            disabled={!canEdit || scheduled}
                            onClick={() =>
                              setExcluded((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.key)) next.delete(p.key);
                                else next.add(p.key);
                                return next;
                              })
                            }
                            className={`flex w-full flex-col items-start gap-1 rounded-lg p-2 text-left text-xs ${
                              out ? "border border-dashed border-faint text-faint" : "border border-line bg-surface shadow-[0_1px_2px_rgba(23,24,28,0.06)]"
                            }`}
                          >
                            <span className="flex flex-wrap gap-1">
                              {p.placements.map((k) => (
                                <PlacementChip key={k} kind={k} />
                              ))}
                            </span>
                            <span className={`text-[13px] font-semibold leading-snug ${out ? "line-through" : ""}`}>{p.title}</span>
                            <span className="text-[11px] text-muted">
                              {p.pillar} · {FORMAT_LABEL[p.format]} · {p.time === "19:00" ? "7 PM" : p.time}
                            </span>
                            {scheduled && <span className="text-[11px] font-semibold text-success">On the calendar</span>}
                          </button>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
