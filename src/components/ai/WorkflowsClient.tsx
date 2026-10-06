"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { buttonClass } from "@/components/ui";
import type { ToolResult } from "@/app/o/[org]/ai/tools-actions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hourText = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
export const scheduleText = (w: { cadence: string; weekday: number; hour: number }) =>
  w.cadence === "daily" ? `Every day at ${hourText(w.hour)}` : w.cadence === "weekly" ? `Every ${DAYS[w.weekday]} at ${hourText(w.hour)}` : `On the 1st of each month at ${hourText(w.hour)}`;

type Kind = "ideas" | "analytics" | "overdue" | "unscheduled" | "festivals" | "custom";
interface Template {
  kind: Kind;
  name: string;
  group: string;
  body: string;
  ai: "required" | "optional" | "none";
  scope: "space" | "any";
  cadence: "daily" | "weekly" | "monthly";
}
interface Row {
  id: string;
  name: string;
  kind: Kind;
  space: string | null;
  cadence: string;
  weekday: number;
  hour: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  mine: boolean;
}

function NewWorkflow({ template, spaces, canOrgWide, aiReady, create, onClose }: { template: Template; spaces: { slug: string; name: string }[]; canOrgWide: boolean; aiReady: boolean; create: (input: unknown) => Promise<ToolResult<{ id: string }>>; onClose: () => void }) {
  const [space, setSpace] = useState(template.scope === "any" && canOrgWide ? "" : (spaces[0]?.slug ?? ""));
  const [name, setName] = useState(template.kind === "custom" ? "" : template.name);
  const [prompt, setPrompt] = useState("");
  const [cadence, setCadence] = useState(template.cadence);
  const [weekday, setWeekday] = useState(0);
  const [hour, setHour] = useState(9);
  const [pending, start] = useTransition();
  const field = "h-9 rounded-lg border border-line bg-surface px-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label="Close" className="fixed inset-0 cursor-default" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`New workflow: ${template.name}`}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await create({ kind: template.kind, space: space || null, name: name.trim(), prompt, cadence, weekday, hour });
            if (!r.ok) return void toast("error", "Couldn’t create the workflow", r.error);
            toast("success", "Workflow created", scheduleText({ cadence, weekday, hour }));
            onClose();
          });
        }}
        className="relative flex w-full max-w-[520px] flex-col gap-4 rounded-2xl bg-surface p-5 shadow-2xl"
      >
        <div>
          <h2 className="text-[17px] font-semibold">{template.name}</h2>
          <p className="text-sm text-muted">{template.body}</p>
          {template.ai !== "none" && !aiReady && (
            <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-ink">
              {template.ai === "required" ? "This one needs AI, which isn’t set up yet (ANTHROPIC_API_KEY): its runs will fail until it is." : "Without AI set up it still runs, with the numbers and no AI write-up."}
            </p>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="What it does" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Space
          <select value={space} onChange={(e) => setSpace(e.target.value)} className={field}>
            {template.scope === "any" && canOrgWide && <option value="">Every space</option>}
            {spaces.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {template.kind === "custom" && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            What should it do?
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} maxLength={2000} placeholder="For example: Every Monday, check last week's Reels and tell me which hooks to reuse." className="rounded-lg border border-line px-3 py-2 text-sm font-normal" />
          </label>
        )}
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Runs
            <select value={cadence} onChange={(e) => setCadence(e.target.value as Template["cadence"])} className={field}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly (1st)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            On
            <select value={weekday} disabled={cadence !== "weekly"} onChange={(e) => setWeekday(Number(e.target.value))} className={`${field} disabled:opacity-50`}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            At
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={field}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourText(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">Times are in the space’s time zone. You get a notification when it runs, with the result in Runs.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("ghost", "sm")}>
            Cancel
          </button>
          <button type="submit" disabled={pending || (template.scope === "space" && !space)} className={buttonClass("primary", "sm")}>
            {pending ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** AI › Workflows: your recurring jobs and the templates to start one. */
export function WorkflowsClient(props: {
  org: string;
  templates: Template[];
  rows: Row[];
  spaces: { slug: string; name: string }[];
  canOrgWide: boolean;
  aiReady: boolean;
  runsThisMonth: number;
  create: (input: unknown) => Promise<ToolResult<{ id: string }>>;
  toggle: (id: string, enabled: boolean) => Promise<ToolResult>;
  remove: (id: string) => Promise<ToolResult>;
  runNow: (id: string) => Promise<ToolResult<{ runId: string }>>;
}) {
  const [making, setMaking] = useState<Template | null>(null);
  const [, start] = useTransition();
  const act = (fn: () => Promise<ToolResult>, done: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast("success", done);
      else toast("error", "That didn’t work", r.error);
    });
  const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const groups = [...new Set(props.templates.map((t) => t.group))];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 pb-14">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted">Recurring jobs that run on their own: digests, checks and fresh ideas. {props.runsThisMonth} run{props.runsThisMonth === 1 ? "" : "s"} this month.</p>
        </div>
        <Link href={`/o/${props.org}/ai/runs`} className={buttonClass("secondary", "sm")}>
          See runs
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Your workflows</h2>
        {props.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No workflows yet. Start one from a template below.</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-xl border border-line bg-surface">
            {props.rows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{w.name}</b>
                  <span className="text-xs text-muted">
                    {w.space ?? "Every space"} · {scheduleText(w)} · {w.enabled ? `next ${when(w.nextRunAt)}` : "paused"}
                  </span>
                </span>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" role="switch" checked={w.enabled} onChange={(e) => act(() => props.toggle(w.id, e.target.checked), e.target.checked ? "Workflow on" : "Workflow paused")} className="accent-ink" />
                  On
                </label>
                <button type="button" onClick={() => act(() => props.runNow(w.id), "Running now. You’ll get a notification when it’s done.")} className={buttonClass("secondary", "sm")}>
                  Run now
                </button>
                <button type="button" aria-label={`Delete ${w.name}`} onClick={() => act(() => props.remove(w.id), "Workflow deleted")} className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger-bg hover:text-danger">
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-3">
          <h2 className="border-b border-line pb-1.5 text-sm font-semibold">{g}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {props.templates
              .filter((t) => t.group === g)
              .map((t) => (
                <li key={t.kind} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
                  <span className="flex items-center justify-between gap-2">
                    <b className="text-[14.5px]">{t.name}</b>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.ai === "none" ? "bg-success-bg text-success-ink" : "bg-ai-bg text-ai"}`}>{t.ai === "none" ? "No AI needed" : t.ai === "optional" ? "AI optional" : "Uses AI"}</span>
                  </span>
                  <p className="flex-1 text-[13px] text-muted">{t.body}</p>
                  <button type="button" onClick={() => setMaking(t)} className={`${buttonClass("secondary", "sm")} self-start gap-1`}>
                    Create workflow <Icon name="chevronRight" size={13} />
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {making && <NewWorkflow template={making} spaces={props.spaces} canOrgWide={props.canOrgWide} aiReady={props.aiReady} create={props.create} onClose={() => setMaking(null)} />}
    </div>
  );
}
