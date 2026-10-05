"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { PlacementChip, buttonClass } from "@/components/ui";
import { REGIONS, type Moment } from "@/lib/festivals";
import { PLACEMENTS, PLATFORM_NAMES, type PlacementKind, type Platform } from "@/lib/placements";
import { OBJECTIVES, type Objective, type PlanRow, type StrategyDoc, type StrategyInputs } from "@/lib/strategy";
import { StrategyView } from "./StrategyView";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SOURCE: Record<string, string> = { starter: "Built from your data", ai: "Written with AI", edit: "Edited", restore: "Restored" };

interface Props {
  org: string;
  space: string;
  tab: "strategy" | "plan" | "moments";
  canEditStrategy: boolean;
  canEditContent: boolean;
  canUseAi: boolean;
  inputs: StrategyInputs;
  history: { posts: number; perWeek: number; followers: number; engagementRate: number } | null;
  versions: { version: number; source: string; createdAt: string; doc: StrategyDoc }[];
  currentVersion: number;
  shared: boolean;
  plan: { rows: PlanRow[]; source: string; startsOn: string } | null;
  moments: Moment[];
  today: string;
  ideaCount: number;
  actions: {
    create: (inputs: StrategyInputs, mode: "starter" | "ai") => Promise<Result<{ version: number }>>;
    saveEdit: (doc: StrategyDoc) => Promise<Result<{ version: number }>>;
    restore: (version: number) => Promise<Result<{ version: number }>>;
    share: () => Promise<Result<{ url: string }>>;
    unshare: () => Promise<Result>;
    makePlan: (mode: "starter" | "ai") => Promise<Result>;
    updatePlan: (rows: PlanRow[], startsOn: string) => Promise<Result>;
    addToCalendar: (ids: string[]) => Promise<Result<{ added: number }>>;
    addMoment: (input: { name: string; date: string; note: string }) => Promise<Result>;
    removeMoment: (id: string) => Promise<Result>;
    momentIdea: (m: { name: string; date: string; idea?: string }) => Promise<Result>;
  };
}

function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "success" }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-xl px-4 py-2.5 text-sm ${tone === "danger" ? "bg-danger-bg text-danger" : "bg-success-bg text-success-ink"}`}>
      {children}
    </p>
  );
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
};

export function StrategyWorkspace(props: Props) {
  const base = `/o/${props.org}/s/${props.space}/strategy`;
  const tabs = [
    ["strategy", "Strategy"],
    ["plan", "Plan 30 days"],
    ["moments", "Festivals & moments"],
  ] as const;
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <nav aria-label="Strategy" className="flex gap-0.5 self-start rounded-lg bg-line-soft p-[3px]">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={k === "strategy" ? base : `${base}?tab=${k}`}
            aria-current={props.tab === k ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${props.tab === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {props.tab === "strategy" && <StrategyTab {...props} />}
      {props.tab === "plan" && <PlanTab {...props} />}
      {props.tab === "moments" && <MomentsTab {...props} />}
    </div>
  );
}

/* ---------- Strategy (SG-01, SG-02) ---------- */

function StrategyTab(props: Props) {
  const current = props.versions.find((v) => v.version === props.currentVersion) ?? null;
  const [viewing, setViewing] = useState<number | null>(null);
  const [mode, setMode] = useState<"view" | "wizard" | "edit">(current ? "view" : "wizard");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = props.versions.find((v) => v.version === (viewing ?? props.currentVersion)) ?? current;

  const run = <T,>(fn: () => Promise<Result<T>>, then?: (r: { ok: true } & T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        then?.(r);
      }
    });

  if (mode === "wizard" || !shown) {
    return (
      <Wizard
        inputs={props.inputs}
        history={props.history}
        canEdit={props.canEditStrategy}
        canUseAi={props.canUseAi}
        pending={pending}
        error={error}
        hasStrategy={Boolean(current)}
        cancel={current ? () => setMode("view") : undefined}
        submit={(inputs, m) => run(() => props.actions.create(inputs, m), () => {
          setViewing(null);
          setMode("view");
        })}
      />
    );
  }

  if (mode === "edit") {
    return <DocEditor doc={shown.doc} pending={pending} error={error} cancel={() => setMode("view")} save={(doc) => run(() => props.actions.saveEdit(doc), () => {
      setViewing(null);
      setMode("view");
    })} />;
  }

  const old = shown.version !== props.currentVersion;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl font-bold">Strategy</h2>
        <select
          aria-label="Version"
          value={shown.version}
          onChange={(e) => setViewing(Number(e.target.value))}
          className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
        >
          {props.versions.map((v) => (
            <option key={v.version} value={v.version}>
              v{v.version} · {SOURCE[v.source] ?? v.source} · {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(v.createdAt))}
              {v.version === props.currentVersion ? " (current)" : ""}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        {props.canEditStrategy && (
          <>
            {old ? (
              <button type="button" disabled={pending} onClick={() => run(() => props.actions.restore(shown.version), () => setViewing(null))} className={buttonClass("primary", "sm")}>
                Restore v{shown.version}
              </button>
            ) : (
              <button type="button" onClick={() => setMode("edit")} className={buttonClass("secondary", "sm")}>
                Edit
              </button>
            )}
            <button type="button" onClick={() => setMode("wizard")} className={buttonClass("secondary", "sm")}>
              Update inputs
            </button>
            {props.shared ? (
              <button type="button" disabled={pending} onClick={() => run(() => props.actions.unshare(), () => setLink(null))} className={buttonClass("ghost", "sm")}>
                Turn off share link
              </button>
            ) : null}
            <button type="button" disabled={pending} onClick={() => run(() => props.actions.share(), (r) => setLink(r.url))} className={buttonClass("primary", "sm")}>
              {props.shared ? "New share link" : "Share with client"}
            </button>
          </>
        )}
      </div>
      {link && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-success-bg px-4 py-2.5 text-sm text-success-ink">
          Read-only link to the current version (older links stop working):
          <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-ink">{link}</code>
          <button type="button" onClick={() => navigator.clipboard.writeText(link)} className={buttonClass("secondary", "sm")}>
            Copy
          </button>
        </div>
      )}
      {old && <Alert>You’re looking at v{shown.version}, an older version. Restore it to make it current.</Alert>}
      {error && <Alert>{error}</Alert>}
      <StrategyView doc={shown.doc} />
    </div>
  );
}

function Wizard({
  inputs,
  history,
  canEdit,
  canUseAi,
  pending,
  error,
  hasStrategy,
  cancel,
  submit,
}: {
  inputs: StrategyInputs;
  history: Props["history"];
  canEdit: boolean;
  canUseAi: boolean;
  pending: boolean;
  error: string | null;
  hasStrategy: boolean;
  cancel?: () => void;
  submit: (inputs: StrategyInputs, mode: "starter" | "ai") => void;
}) {
  const [v, setV] = useState(inputs);
  const set = <K extends keyof StrategyInputs>(k: K, value: StrategyInputs[K]) => setV((x) => ({ ...x, [k]: value }));
  const field = (k: "business" | "industry" | "audience" | "location" | "offer" | "competitors", label: string, hint: string, multiline = false) => (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      {multiline ? (
        <textarea value={v[k]} readOnly={!canEdit} onChange={(e) => set(k, e.target.value)} rows={2} placeholder={hint} className="rounded-lg border border-line p-2.5 font-normal" />
      ) : (
        <input value={v[k]} readOnly={!canEdit} onChange={(e) => set(k, e.target.value)} placeholder={hint} className="h-10 rounded-lg border border-line px-3 font-normal" />
      )}
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(v, "starter");
      }}
      className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <div>
        <h2 className="font-display text-xl font-bold">{hasStrategy ? "Update the strategy inputs" : "Build this space’s strategy"}</h2>
        <p className="text-sm text-muted">
          Filled in from Brand Brain and connected accounts where we could. Check it, then build a starter strategy from your data, or let AI write it.
          {history ? ` Based on ${history.posts} posts in the last 90 days (${history.perWeek} a week).` : " No connected accounts yet, so it starts from your inputs."}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {field("business", "Business", "What you do, in a sentence", true)}
        {field("audience", "Audience", "Who you want to reach", true)}
        {field("industry", "Industry", "Cafe, real estate, fashion…")}
        {field("location", "Location", "City or area")}
        {field("offer", "Offer", "What people buy or book", true)}
        {field("competitors", "Competitors", "Names or handles", true)}
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-semibold">Objective</legend>
        <span className="flex flex-wrap gap-1.5">
          {(Object.keys(OBJECTIVES) as Objective[]).map((o) => (
            <button
              key={o}
              type="button"
              disabled={!canEdit}
              aria-pressed={v.objective === o}
              onClick={() => set("objective", o)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${v.objective === o ? "border-ink bg-ink text-white" : "border-line bg-surface"}`}
            >
              {OBJECTIVES[o]}
            </button>
          ))}
        </span>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-semibold">Platforms</legend>
          {(["instagram", "facebook", "linkedin"] as Platform[]).map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={v.platforms.includes(p)}
                onChange={(e) => set("platforms", e.target.checked ? [...v.platforms, p] : v.platforms.filter((x) => x !== p))}
                className="accent-ink"
              />
              {PLATFORM_NAMES[p]}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Posts you can make a week
          <input type="number" min={1} max={21} value={v.postsPerWeek} readOnly={!canEdit} onChange={(e) => set("postsPerWeek", Math.max(1, Math.min(21, Number(e.target.value) || 1)))} className="h-10 w-28 rounded-lg border border-line px-3 font-normal" />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-semibold">Festivals from</legend>
          {(["north", "south", "east", "west"] as const).map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={v.regions.includes(r)}
                onChange={(e) => set("regions", e.target.checked ? [...v.regions, r] : v.regions.filter((x) => x !== r))}
                className="accent-ink"
              />
              {REGIONS[r]}
            </label>
          ))}
        </fieldset>
      </div>
      {error && <Alert>{error}</Alert>}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || v.platforms.length === 0} className={buttonClass(canUseAi ? "secondary" : "primary")}>
            {pending ? "Working…" : "Build from my data"}
          </button>
          {canUseAi && (
            <button type="button" disabled={pending || v.platforms.length === 0} onClick={() => submit(v, "ai")} className={buttonClass("primary")}>
              {pending ? "Writing…" : "✦ Write it with AI"}
            </button>
          )}
          {cancel && (
            <button type="button" onClick={cancel} className={buttonClass("ghost")}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Only Managers and above can create the strategy.</p>
      )}
    </form>
  );
}

const lines = (xs: string[]) => xs.join("\n");
const unlines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function DocEditor({ doc, pending, error, cancel, save }: { doc: StrategyDoc; pending: boolean; error: string | null; cancel: () => void; save: (doc: StrategyDoc) => void }) {
  const [d, setD] = useState(doc);
  const total = d.pillars.reduce((a, p) => a + (Number(p.share) || 0), 0);
  const area = (label: string, value: string, onChange: (v: string) => void, rows = 3, hint?: string) => (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="rounded-lg border border-line p-2.5 font-normal" />
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(d);
      }}
      className="flex max-w-4xl flex-col gap-5 rounded-2xl border border-line bg-surface p-5"
    >
      <h2 className="font-display text-xl font-bold">Edit strategy</h2>
      <p className="-mt-3 text-sm text-muted">Saving creates a new version; earlier ones stay available.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {area("Positioning", d.positioning, (v) => setD({ ...d, positioning: v }), 4)}
        {area("Audience", d.audience, (v) => setD({ ...d, audience: v }), 4)}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Goals</legend>
        {d.goals.map((g, i) => (
          <span key={i} className="grid grid-cols-[2fr_1.2fr_1.2fr_1fr_auto] gap-2">
            {(["goal", "metric", "target", "by"] as const).map((k) => (
              <input key={k} aria-label={`${k} ${i + 1}`} placeholder={k} value={g[k]} onChange={(e) => setD({ ...d, goals: d.goals.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} className="h-9 rounded-lg border border-line px-2 text-sm" />
            ))}
            <button type="button" onClick={() => setD({ ...d, goals: d.goals.filter((_, j) => j !== i) })} aria-label="Remove goal" className={buttonClass("ghost", "sm")}>
              ✕
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setD({ ...d, goals: [...d.goals, { goal: "", metric: "", target: "", by: "" }] })} className={`${buttonClass("secondary", "sm")} self-start`}>
          + Goal
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">
          Pillars <span className={`font-normal ${total === 100 ? "text-muted" : "text-warn-ink"}`}>· shares add up to {total}% {total !== 100 && "(they’ll be scaled to 100)"}</span>
        </legend>
        {d.pillars.map((p, i) => (
          <span key={i} className="grid grid-cols-[1.2fr_80px_2fr_2fr_auto] gap-2">
            <input aria-label={`Pillar ${i + 1}`} value={p.name} onChange={(e) => setD({ ...d, pillars: d.pillars.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="h-9 rounded-lg border border-line px-2 text-sm" />
            <input aria-label={`Share of ${p.name}`} type="number" min={0} max={100} value={p.share} onChange={(e) => setD({ ...d, pillars: d.pillars.map((x, j) => (j === i ? { ...x, share: Number(e.target.value) } : x)) })} className="h-9 rounded-lg border border-line px-2 text-sm" />
            <input aria-label={`Description of ${p.name}`} placeholder="What it covers" value={p.description} onChange={(e) => setD({ ...d, pillars: d.pillars.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} className="h-9 rounded-lg border border-line px-2 text-sm" />
            <input aria-label={`Examples for ${p.name}`} placeholder="Examples, separated by ;" value={p.examples.join("; ")} onChange={(e) => setD({ ...d, pillars: d.pillars.map((x, j) => (j === i ? { ...x, examples: e.target.value.split(";").map((s) => s.trim()) } : x)) })} className="h-9 rounded-lg border border-line px-2 text-sm" />
            <button type="button" onClick={() => setD({ ...d, pillars: d.pillars.filter((_, j) => j !== i) })} aria-label="Remove pillar" className={buttonClass("ghost", "sm")}>
              ✕
            </button>
          </span>
        ))}
        <button type="button" disabled={d.pillars.length >= 7} onClick={() => setD({ ...d, pillars: [...d.pillars, { name: "", share: 10, description: "", examples: [] }] })} className={`${buttonClass("secondary", "sm")} self-start`}>
          + Pillar
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Formats and frequency (posts a week)</legend>
        <span className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
          {(Object.keys(PLACEMENTS) as PlacementKind[]).map((k) => {
            const c = d.cadence.find((x) => x.format === k);
            return (
              <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft px-2.5 py-1.5 text-sm">
                {PLACEMENTS[k].label}
                <input
                  type="number"
                  min={0}
                  max={14}
                  step={0.5}
                  value={c?.perWeek ?? 0}
                  onChange={(e) => {
                    const perWeek = Number(e.target.value);
                    const rest = d.cadence.filter((x) => x.format !== k);
                    setD({ ...d, cadence: perWeek > 0 ? [...rest, { platform: PLACEMENTS[k].platform as "instagram" | "facebook" | "linkedin", format: k, perWeek }] : rest });
                  }}
                  className="h-8 w-16 rounded-md border border-line px-1.5"
                />
              </label>
            );
          })}
        </span>
      </fieldset>

      <div className="grid gap-3 md:grid-cols-2">
        {area("Themes", lines(d.themes), (v) => setD({ ...d, themes: unlines(v) }), 4, "One per line")}
        {(["reach", "engagement", "community", "conversion"] as const).map((k) =>
          area(`Tactics: ${k}`, lines(d.tactics[k]), (v) => setD({ ...d, tactics: { ...d.tactics, [k]: unlines(v) } }), 3, "One per line"),
        )}
        {area("First 30 days", lines(d.plan.days30), (v) => setD({ ...d, plan: { ...d.plan, days30: unlines(v) } }), 4, "One per line")}
        {area("By day 60", lines(d.plan.days60), (v) => setD({ ...d, plan: { ...d.plan, days60: unlines(v) } }), 4, "One per line")}
        {area("By day 90", lines(d.plan.days90), (v) => setD({ ...d, plan: { ...d.plan, days90: unlines(v) } }), 4, "One per line")}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : "Save as new version"}
        </button>
        <button type="button" onClick={cancel} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---------- Plan 30 days (SG-03) ---------- */

function PlanTab(props: Props) {
  const [rows, setRows] = useState<PlanRow[]>(props.plan?.rows ?? []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set((props.plan?.rows ?? []).map((r) => r.id)));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentName = new Map(props.moments.map((m) => [m.id, m.name]));
  const pillars = [...new Set(rows.map((r) => r.pillar))];

  // A fresh plan from the server (new or after adding to the calendar) replaces local rows.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(props.plan?.rows ?? []);
    setSelected(new Set((props.plan?.rows ?? []).map((r) => r.id)));
  }, [props.plan]);

  const persist = (next: PlanRow[]) => {
    setRows(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      start(async () => {
        const r = await props.actions.updatePlan(next, props.plan?.startsOn ?? props.today);
        if (!r.ok) setError(r.error);
      });
    }, 700);
  };
  const edit = (id: string, patch: Partial<PlanRow>) => persist(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const run = <T,>(fn: () => Promise<Result<T>>, then?: (r: { ok: true } & T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        then?.(r);
      }
    });

  if (!props.currentVersion) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="text-muted">The plan follows the strategy’s pillars and formats. Create the strategy first.</p>
        <Link href={`/o/${props.org}/s/${props.space}/strategy`} className={`${buttonClass("primary")} mt-3`}>
          Create the strategy
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl font-bold">Plan 30 days</h2>
        {props.plan && <span className="text-sm text-muted">{rows.length} posts · {props.plan.source === "ai" ? "written with AI" : props.plan.source === "edit" ? "edited" : "from your strategy and data"}</span>}
        <span className="flex-1" />
        {props.canEditContent && (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => props.actions.makePlan("starter"))} className={buttonClass(props.canUseAi ? "secondary" : "primary", "sm")}>
              {props.plan ? "New plan from data" : "Plan 30 days"}
            </button>
            {props.canUseAi && (
              <button type="button" disabled={pending} onClick={() => run(() => props.actions.makePlan("ai"))} className={buttonClass("primary", "sm")}>
                {pending ? "Working…" : "✦ Plan with AI"}
              </button>
            )}
          </>
        )}
      </div>
      {props.plan && rows.length > 0 && (
        <p className="text-sm text-muted">
          Dates, formats and pillars follow the strategy’s cadence and shares, at your best posting time.
          {props.ideaCount ? " Topics come from the Idea Bank where a pillar matches." : ""} Festivals take over the nearest post. Edit anything, untick what you don’t want, then add it to the calendar.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {!props.plan || rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-muted">
          {props.plan ? "Everything in this plan is on the calendar. Make a new plan for the next 30 days." : "No plan yet. “Plan 30 days” fills a table you can edit before anything is created."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-subtle text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selected.size === rows.length}
                      onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}
                      className="accent-ink"
                    />
                  </th>
                  <th className="px-2 py-2.5">Date</th>
                  <th className="px-2 py-2.5">Time</th>
                  <th className="px-2 py-2.5">Format</th>
                  <th className="px-2 py-2.5">Pillar</th>
                  <th className="px-2 py-2.5">Topic</th>
                  <th className="px-2 py-2.5">Hook</th>
                  <th className="px-2 py-2.5">CTA</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-line-soft align-top ${selected.has(r.id) ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Include ${r.topic}`}
                        checked={selected.has(r.id)}
                        onChange={() => setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })}
                        className="accent-ink"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="date" aria-label="Date" value={r.date} disabled={!props.canEditContent} onChange={(e) => e.target.value && edit(r.id, { date: e.target.value })} className="h-8 rounded-md border border-line px-1" />
                      <span className="block text-[11px] text-muted">{fmtDate(r.date)}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="time" aria-label="Time" value={r.time} disabled={!props.canEditContent} onChange={(e) => e.target.value && edit(r.id, { time: e.target.value })} className="h-8 rounded-md border border-line px-1" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        aria-label="Format"
                        value={r.format}
                        disabled={!props.canEditContent}
                        onChange={(e) => edit(r.id, { format: e.target.value as PlacementKind, platform: PLACEMENTS[e.target.value as PlacementKind].platform as PlanRow["platform"] })}
                        className="h-8 rounded-md border border-line bg-surface px-1"
                      >
                        {(Object.keys(PLACEMENTS) as PlacementKind[]).map((k) => (
                          <option key={k} value={k}>
                            {PLACEMENTS[k].short}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input list="plan-pillars" aria-label="Pillar" value={r.pillar} disabled={!props.canEditContent} onChange={(e) => edit(r.id, { pillar: e.target.value })} className="h-8 w-32 rounded-md border border-line px-1.5" />
                    </td>
                    <td className="min-w-[220px] px-2 py-1.5">
                      <textarea aria-label="Topic" rows={2} value={r.topic} disabled={!props.canEditContent} onChange={(e) => edit(r.id, { topic: e.target.value })} className="w-full rounded-md border border-line px-1.5 py-1" />
                      {r.momentId && <span className="text-[11px] font-semibold text-accent-ink">🎉 {momentName.get(r.momentId) ?? "Festival"}</span>}
                      {r.ideaId && <span className="text-[11px] font-semibold text-ai">From the Idea Bank</span>}
                    </td>
                    <td className="min-w-[220px] px-2 py-1.5">
                      <textarea aria-label="Hook" rows={2} value={r.hook} disabled={!props.canEditContent} placeholder="Opening line" onChange={(e) => edit(r.id, { hook: e.target.value })} className="w-full rounded-md border border-line px-1.5 py-1" />
                    </td>
                    <td className="min-w-[160px] px-2 py-1.5">
                      <input aria-label="Call to action" value={r.cta} disabled={!props.canEditContent} onChange={(e) => edit(r.id, { cta: e.target.value })} className="h-8 w-full rounded-md border border-line px-1.5" />
                    </td>
                    <td className="px-2 py-1.5">
                      {props.canEditContent && (
                        <button type="button" aria-label={`Remove ${r.topic}`} onClick={() => persist(rows.filter((x) => x.id !== r.id))} className={buttonClass("ghost", "sm")}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="plan-pillars">
              {pillars.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          {props.canEditContent && (
            <div className="sticky bottom-4 flex flex-wrap items-center gap-3 self-start rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-2xl">
              {selected.size} of {rows.length} selected
              <button
                type="button"
                disabled={pending || selected.size === 0}
                onClick={() => {
                  if (timer.current) clearTimeout(timer.current);
                  run(
                    async () => {
                      const saved = await props.actions.updatePlan(rows, props.plan?.startsOn ?? props.today);
                      return saved.ok ? props.actions.addToCalendar([...selected]) : saved;
                    },
                    (r) => setNotice(`${"added" in r ? r.added : selected.size} drafts added under “Not started”. They’re on the Board and Calendar.`),
                  );
                }}
                className="h-9 rounded-lg bg-white px-3 font-semibold text-ink disabled:opacity-50"
              >
                Add {selected.size} to calendar
              </button>
            </div>
          )}
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Formats:
            {[...new Set(rows.map((r) => r.format))].map((k) => (
              <PlacementChip key={k} kind={k} />
            ))}
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- Festivals and moments (SG-04) ---------- */

function MomentsTab(props: Props) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", date: "", note: "" });
  const byMonth = new Map<string, Moment[]>();
  for (const m of props.moments) {
    const key = m.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), m]);
  }
  const run = (fn: () => Promise<Result>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        if (done) setNotice(done);
      }
    });
  const until = (iso: string) => Math.round((Date.parse(iso) - Date.parse(props.today)) / 864e5);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">Festivals and moments</h2>
          <p className="text-sm text-muted">The next four months, India first, for the regions chosen in the strategy. Dates marked “approx.” follow the lunar calendar and can shift by a day by region; check locally.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {[...byMonth.entries()].map(([month, list]) => (
          <section key={month} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted">
              {new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}
            </h3>
            <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-surface">
              {list.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className="w-24 shrink-0 text-sm font-semibold">
                    {fmtDate(m.date)}
                    <span className="block text-xs font-normal text-muted">{until(m.date) === 0 ? "today" : `in ${until(m.date)} days`}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>{m.name}</strong>
                      <span className="rounded-full bg-line-soft px-2 py-0.5 text-[11px]">{m.kind === "custom" ? "Your date" : REGIONS[m.region]}</span>
                      {m.approximate && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] text-warn-ink">approx.</span>}
                    </span>
                    {(m.idea || m.note) && <span className="text-sm text-ink-2">{m.idea ?? m.note}</span>}
                    {m.leadDays && until(m.date) > m.leadDays && <span className="text-xs text-muted">Start teasing {m.leadDays} days before.</span>}
                  </span>
                  {props.canEditContent && (
                    <span className="flex gap-1">
                      <button type="button" disabled={pending} onClick={() => run(() => props.actions.momentIdea({ name: m.name, date: m.date, idea: m.idea ?? m.note }), `“${m.name} campaign” is in the Idea Bank.`)} className={buttonClass("secondary", "sm")}>
                        Add as campaign idea
                      </button>
                      {m.kind === "custom" && (
                        <button type="button" disabled={pending} onClick={() => run(() => props.actions.removeMoment(m.id))} aria-label={`Remove ${m.name}`} className={buttonClass("ghost", "sm")}>
                          ✕
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {props.canEditContent && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => props.actions.addMoment(form), `${form.name} added.`);
            setForm({ name: "", date: "", note: "" });
          }}
          className="flex h-fit flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
        >
          <h3 className="font-semibold">Add your own date</h3>
          <p className="text-sm text-muted">Anniversaries, launches, local events, IPL matches.</p>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cafe’s 3rd birthday" aria-label="Name" className="h-10 rounded-lg border border-line px-3 text-sm" />
          <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" className="h-10 rounded-lg border border-line px-3 text-sm" />
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Campaign idea (optional)" aria-label="Note" className="h-10 rounded-lg border border-line px-3 text-sm" />
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            Add date
          </button>
        </form>
      )}
    </div>
  );
}
