"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { AutoRefresh } from "@/components/accounts/AccountsClient";
import { PlacementChip, buttonClass } from "@/components/ui";
import { PLACEMENTS, PLATFORM_NAMES, type PlacementKind, type Platform } from "@/lib/placements";
import type { Issue } from "@/lib/publishing/rules";
import type { PublishResult } from "@/app/o/[org]/s/[space]/publish-actions";
import type { PublishView } from "@/server/publishing";

type Act = () => Promise<PublishResult>;

const STATE: Record<string, [string, string]> = {
  draft: ["Not scheduled", "bg-line-soft text-ink-2"],
  scheduled: ["Scheduled", "bg-data-bg text-data"],
  publishing: ["Publishing…", "bg-accent-bg text-accent-ink"],
  published: ["Published", "bg-success-bg text-success-ink"],
  failed: ["Failed", "bg-danger-bg text-danger"],
};

/** Jump to the part of the panel that fixes an issue (PB-07). */
function focusSection(id: string) {
  if (id === "panel-media") window.dispatchEvent(new Event("panel:show-media"));
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  (el?.querySelector("textarea, input, select, button") as HTMLElement | null)?.focus({ preventScroll: true });
}

const SECTION: Partial<Record<Issue["fix"]["kind"], string>> = {
  media: "panel-media",
  caption: "panel-caption",
  placements: "panel-platforms",
  status: "panel-status",
};

function FixButton({ issue, org, space, onDone, share }: { issue: Issue; org: string; space: string; onDone: () => void; share?: () => Promise<void> }) {
  const { kind, label } = issue.fix;
  if (kind === "accounts") {
    return (
      <Link href={`/o/${org}/s/${space}/settings/accounts`} className={buttonClass("secondary", "sm")}>
        {label}
      </Link>
    );
  }
  if (kind === "approval" && share) {
    return (
      <button type="button" onClick={() => share()} className={buttonClass("secondary", "sm")}>
        {label}
      </button>
    );
  }
  if (kind === "settings") {
    return <span className="text-xs text-muted">Set APP_URL in .env.local</span>;
  }
  if (kind === "time") {
    return (
      <button type="button" onClick={() => document.getElementById("schedule-when")?.focus()} className={buttonClass("secondary", "sm")}>
        {label}
      </button>
    );
  }
  const target = SECTION[kind] ?? (kind === "approval" ? "panel-status" : "panel-platforms");
  return (
    <button
      type="button"
      onClick={() => {
        onDone();
        setTimeout(() => focusSection(target), 50);
      }}
      className={buttonClass("secondary", "sm")}
    >
      {label}
    </button>
  );
}

export function IssueList({ issues, org, space, onFix, share }: { issues: Issue[]; org: string; space: string; onFix: () => void; share?: () => Promise<void> }) {
  return (
    <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line">
      {issues.map((i, n) => (
        <li key={n} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">{i.message}</span>
          <FixButton issue={i} org={org} space={space} onDone={onFix} share={share} />
        </li>
      ))}
    </ul>
  );
}

/** Today + 1 day at 10:00, as a datetime-local value in the space's timezone. */
function defaultWhen(scheduledAt: string | null, timeZone: string, now: number) {
  const d = scheduledAt ? new Date(scheduledAt) : new Date(now + 864e5);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${scheduledAt ? `${parts.hour}:${parts.minute}` : "10:00"}`;
}

/** PB-03: Post now, or schedule with autopost on or off. Readiness failures come back as fixes. */
export function ScheduleControls({
  org,
  space,
  view,
  timeZone,
  scheduleText,
  canSchedule,
  requestTime,
  schedule,
  unschedule,
  share,
}: {
  org: string;
  space: string;
  view: PublishView;
  timeZone: string;
  scheduleText: string | null;
  canSchedule: boolean;
  requestTime: number;
  schedule: (input: { mode: "now" | "autopost" | "manual"; when?: string }) => Promise<PublishResult>;
  unschedule: Act;
  share: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"now" | "later">("later");
  const [autopost, setAutopost] = useState(view.autopost);
  const [when, setWhen] = useState(() => defaultWhen(view.scheduledAt, timeZone, requestTime));
  const [result, setResult] = useState<PublishResult | null>(null);
  const [pending, start] = useTransition();
  const open = () => {
    setResult(null);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  const allPublished = view.placements.length > 0 && view.placements.every((p) => p.state === "published");
  if (!canSchedule || allPublished) {
    return view.publishState === "scheduled" && scheduleText ? <span className="text-[13px] text-muted">Scheduled {scheduleText}</span> : null;
  }

  const submit = () =>
    start(async () => {
      const r = await schedule(mode === "now" ? { mode: "now" } : { mode: autopost ? "autopost" : "manual", when });
      setResult(r);
      if (!r.error && r.issues.length === 0) close();
    });

  const isScheduled = view.publishState === "scheduled";
  return (
    <>
      {isScheduled ? (
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-data">
            {view.autopost ? "Autopost" : "Reminder"} · {scheduleText}
          </span>
          <button type="button" onClick={open} className={buttonClass("secondary", "sm")}>
            Change
          </button>
          <button type="button" disabled={pending} onClick={() => start(async () => void (await unschedule()))} className={buttonClass("ghost", "sm")}>
            Unschedule
          </button>
        </span>
      ) : (
        <button type="button" onClick={open} className={buttonClass("primary", "sm")} disabled={view.publishState === "publishing"}>
          {view.publishState === "publishing" ? "Publishing…" : "Schedule or post"}
        </button>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="schedule-title"
        onKeyDown={(e) => {
          // Esc closes this dialog, not the whole panel behind it.
          if (e.key === "Escape") e.stopPropagation();
        }}
        className="m-auto w-[min(560px,92vw)] rounded-2xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4 p-5"
        >
          <h2 id="schedule-title" className="font-display text-xl font-bold">
            {result?.issues.length ? "Fix these issues before posting" : "Publish this post"}
          </h2>

          {result?.issues.length ? (
            <IssueList issues={result.issues} org={org} space={space} onFix={close} share={share} />
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">When</legend>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "now" ? "border-ink" : "border-line"}`}>
                  <input type="radio" name="mode" checked={mode === "now"} onChange={() => setMode("now")} className="mt-1 accent-ink" />
                  <span>
                    <strong className="block text-[15px]">Post now</strong>
                    <span className="text-sm text-muted">Publishes to every platform on this post right away.</span>
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "later" ? "border-ink" : "border-line"}`}>
                  <input type="radio" name="mode" checked={mode === "later"} onChange={() => setMode("later")} className="mt-1 accent-ink" />
                  <span className="flex flex-1 flex-col gap-2">
                    <strong className="text-[15px]">Schedule</strong>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <input
                        id="schedule-when"
                        type="datetime-local"
                        value={when}
                        onChange={(e) => {
                          setMode("later");
                          setWhen(e.target.value);
                        }}
                        className="h-9 rounded-lg border border-line px-2"
                        aria-label="Date and time"
                      />
                      <span className="text-muted">{timeZone.replace("Asia/Kolkata", "IST")}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      <input id="autopost" type="checkbox" checked={autopost} onChange={(e) => setAutopost(e.target.checked)} className="size-4 accent-ink" />
                      <label htmlFor="autopost">
                        <strong>Autopost</strong> <span className="text-muted">— publish automatically. Off: you get a reminder to post it yourself.</span>
                      </label>
                    </span>
                  </span>
                </label>
              </fieldset>
              <p className="text-[13px] text-muted">
                Posts to {view.placements.filter((p) => p.state !== "published").map((p) => PLACEMENTS[p.kind].label).join(", ") || "no platforms yet"}.
              </p>
            </>
          )}

          {result?.error && (
            <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
              {result.error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} className={buttonClass("ghost")}>
              {result?.issues.length ? "Close" : "Cancel"}
            </button>
            {result?.issues.length ? (
              <button type="button" onClick={() => setResult(null)} className={buttonClass("secondary")}>
                Back
              </button>
            ) : (
              <button type="submit" disabled={pending} className={buttonClass("primary")}>
                {pending ? "Checking…" : mode === "now" ? "Post now" : autopost ? "Schedule post" : "Schedule reminder"}
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}

function ManualForm({ markManual, onDone }: { markManual: (link: string) => Promise<PublishResult>; onDone: () => void }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await markManual(link);
          if (r.error) setError(r.error);
          else onDone();
        });
      }}
      className="flex w-full flex-wrap items-center gap-2"
    >
      <input
        type="url"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://www.instagram.com/p/…"
        aria-label="Post link"
        className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2 text-[13px]"
      />
      <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
        Mark as posted
      </button>
      {error && <span className="w-full text-xs text-danger">{error}</span>}
    </form>
  );
}

function PlacementRow({
  p,
  org,
  space,
  canEdit,
  canSchedule,
  locked,
  actions,
}: {
  p: PublishView["placements"][number];
  org: string;
  space: string;
  canEdit: boolean;
  canSchedule: boolean;
  locked: boolean;
  actions: { retry: Act; markManual: (link: string) => Promise<PublishResult>; remove: Act; shareToFeed: (v: boolean) => Promise<PublishResult> };
}) {
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(false);
  const [message, setMessage] = useState<{ issues: Issue[]; error?: string } | null>(null);
  const [label, tone] = STATE[p.state] ?? STATE.draft;
  const run = (fn: Act) =>
    start(async () => {
      const r = await fn();
      setMessage(r.error || r.issues.length ? r : null);
    });

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <PlacementChip kind={p.kind} />
        <span className={`text-[13px] ${p.handle ? "" : "text-warn-ink"}`}>{p.handle ?? "No account"}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
          {p.state === "published" && p.publishedManually ? "Posted manually" : label}
        </span>
        <span className="flex-1" />
        {p.permalink && (
          <a href={p.permalink} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
            View post
          </a>
        )}
        {p.state === "published" && !p.permalink && <span className="text-xs text-muted">No link</span>}
        {canSchedule && p.state === "failed" && (
          <button type="button" disabled={pending} onClick={() => run(actions.retry)} className={buttonClass("primary", "sm")}>
            {pending ? "Retrying…" : "Retry"}
          </button>
        )}
        {canSchedule && p.state !== "published" && p.state !== "publishing" && (
          <button type="button" onClick={() => setManual(!manual)} className={buttonClass("ghost", "sm")}>
            {manual ? "Cancel" : "Mark as posted"}
          </button>
        )}
        {canEdit && !locked && p.state !== "published" && (
          <button type="button" aria-label={`Remove ${PLACEMENTS[p.kind].label}`} disabled={pending} onClick={() => run(actions.remove)} className={buttonClass("ghost", "sm")}>
            ✕
          </button>
        )}
      </div>
      {p.kind === "ig_reel" && p.state !== "published" && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={p.shareToFeed} disabled={!canEdit || locked} onChange={(e) => run(() => actions.shareToFeed(e.target.checked))} className="accent-ink" />
          Also share the Reel to the main feed
        </label>
      )}
      {p.error && p.state !== "published" && <p className={`text-[13px] ${p.state === "failed" ? "text-danger" : "text-muted"}`}>{p.error}</p>}
      {manual && <ManualForm markManual={actions.markManual} onDone={() => setManual(false)} />}
      {message?.error && <p className="text-[13px] text-danger">{message.error}</p>}
      {message?.issues.length ? <IssueList issues={message.issues} org={org} space={space} onFix={() => setMessage(null)} /> : null}
    </li>
  );
}

/** Platforms and publishing results for one post (PB-05, PB-09, PB-11, PB-12). */
export function PublishingSection({
  org,
  space,
  view,
  canEdit,
  canSchedule,
  add,
  placementActions,
}: {
  org: string;
  space: string;
  view: PublishView;
  canEdit: boolean;
  canSchedule: boolean;
  add: (kind: PlacementKind) => Promise<PublishResult>;
  placementActions: Record<string, { retry: Act; markManual: (link: string) => Promise<PublishResult>; remove: Act; shareToFeed: (v: boolean) => Promise<PublishResult> }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const locked = view.publishState === "scheduled" || view.placements.some((p) => p.state === "publishing" || p.state === "scheduled");
  const present = new Set(view.placements.map((p) => p.kind));
  const options = (Object.keys(PLACEMENTS) as PlacementKind[]).filter((k) => !present.has(k));
  const pendingCount = view.placements.filter((p) => p.state !== "published").length;

  return (
    <div id="panel-platforms" className="flex flex-col gap-2">
      <AutoRefresh active={view.live} everyMs={1500} />
      <div className="flex items-center justify-between gap-2 px-2">
        <h3 className="text-sm font-semibold">Platforms</h3>
        {canEdit && !locked && options.length > 0 && (
          <select
            aria-label="Add a platform"
            value=""
            disabled={pending}
            onChange={(e) => {
              const kind = e.target.value as PlacementKind;
              start(async () => {
                const r = await add(kind);
                setError(r.error ?? null);
              });
            }}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] font-semibold"
          >
            <option value="">+ Add platform</option>
            {(["instagram", "facebook", "linkedin"] as Platform[]).map((platform) => (
              <optgroup key={platform} label={`${PLATFORM_NAMES[platform]}${view.connectedPlatforms.includes(platform) ? "" : " (not connected)"}`}>
                {options
                  .filter((k) => PLACEMENTS[k].platform === platform)
                  .map((k) => (
                    <option key={k} value={k}>
                      {PLACEMENTS[k].label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>
      {locked && canEdit && <p className="px-2 text-xs text-muted">Unschedule to change platforms.</p>}
      {error && <p className="px-2 text-[13px] text-danger">{error}</p>}
      {view.placements.length === 0 ? (
        <p className="px-2 text-sm text-muted">No platforms yet. Add where this post goes.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line">
          {view.placements.map((p) => (
            <PlacementRow key={p.id} p={p} org={org} space={space} canEdit={canEdit} canSchedule={canSchedule} locked={locked} actions={placementActions[p.id]} />
          ))}
        </ul>
      )}

      {pendingCount > 0 && view.publishState !== "publishing" && (
        <details className="rounded-xl px-2 text-sm">
          <summary className="cursor-pointer list-none">
            {view.issues.length === 0 ? (
              <span className="font-semibold text-success-ink">✓ Ready to post automatically</span>
            ) : (
              <span className="text-ink-2">
                <span className="font-semibold text-warn-ink">
                  {view.issues.length} thing{view.issues.length === 1 ? "" : "s"} to fix
                </span>{" "}
                before it can post automatically <span className="text-muted">· show</span>
              </span>
            )}
          </summary>
          {view.issues.length > 0 && (
            <div className="mt-2">
              <IssueList issues={view.issues} org={org} space={space} onFix={() => {}} />
            </div>
          )}
        </details>
      )}

      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-2 text-[13px] text-muted">
          Posting it yourself?
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(view.caption);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className={buttonClass("secondary", "sm")}
          >
            {copied ? "Copied" : "Copy caption"}
          </button>
          {view.mediaIds.map((m, i) => (
            <a key={m.id} href={`/api/o/${org}/s/${space}/media/${m.id}?download=1`} className={buttonClass("secondary", "sm")} title={m.filename}>
              Download media{view.mediaIds.length > 1 ? ` ${i + 1}` : ""}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
