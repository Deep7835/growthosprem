"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { IssueList } from "@/components/content/Publishing";
import { PlacementChip, buttonClass } from "@/components/ui";
import { isoDate } from "@/lib/analytics/time";
import { PLATFORM_COLOR } from "@/lib/analytics/colors";
import { dayLabel, layoutLanes, localValue, minutesAt, parseDate, shift, title, VIEWS, visibleDays, weekdayHeaders, type CalendarView, type WeekStart } from "@/lib/calendar";
import { PLATFORM_NAMES, type Platform } from "@/lib/placements";
import type { MoveResult } from "@/app/o/[org]/calendar-actions";
import type { Issue } from "@/lib/publishing/rules";
import type { CalendarData, CalendarEvent, CalendarFilters } from "@/server/calendar";

const HOUR_PX = 48;
const VIEW_LABEL: Record<CalendarView, string> = { month: "Month", week: "Week", day: "Day", list: "List" };
const STATE_MARK: Record<string, [string, string]> = {
  scheduled: ["⏱", "Scheduled to publish"],
  published: ["✓", "Published"],
  partially_published: ["!", "Partly published"],
  failed: ["!", "Publishing failed"],
  publishing: ["…", "Publishing"],
};

export function timeText(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

type Move = (space: string, id: string, when: string, timeZone: string) => Promise<MoveResult>;

interface Props {
  scope: "space" | "org";
  org: string;
  basePath: string;
  query: Record<string, string>;
  view: CalendarView;
  date: string;
  today: string;
  nowMinutes: number;
  weekStart: WeekStart;
  colorBy: "platform" | "status";
  timeZone: string;
  data: CalendarData;
  filters: CalendarFilters;
  spaces?: { slug: string; name: string; color: string; selected: boolean }[];
  canMove: boolean;
  /** Festivals and moments in view (SG-04), shown as markers. */
  moments?: { date: string; name: string; approximate?: boolean }[];
  moveContent: Move;
  moveTask: Move;
  setPrefs: (prefs: { calendarColor?: "platform" | "status"; weekStartsOn?: WeekStart }) => Promise<void>;
}

export function Calendar(props: Props) {
  const { view, data, scope, org, basePath, weekStart, colorBy, timeZone } = props;
  const router = useRouter();
  const anchor = parseDate(props.date)!;
  const [overrides, setOverrides] = useState<Record<string, { date: string; minutes: number }>>({});
  const [drag, setDrag] = useState<CalendarEvent | null>(null);
  const [hint, setHint] = useState<{ date: string; minutes: number | null } | null>(null);
  const [confirm, setConfirm] = useState<{ event: CalendarEvent; date: string; minutes: number } | null>(null);
  const [problem, setProblem] = useState<{ event: CalendarEvent; date: string; minutes: number; error?: string; issues?: Issue[] } | null>(null);
  const [hover, setHover] = useState<{ event: CalendarEvent; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, start] = useTransition();

  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(props.query);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    q.delete("content");
    q.delete("task");
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  // Posts open their panel; tasks open the task panel (TK-01), in the event's space.
  const openHref = (e: CalendarEvent) => {
    const id = e.type === "task" ? e.id : e.contentId;
    if (!id) return null;
    const q = new URLSearchParams(scope === "space" ? props.query : { view, date: props.date });
    q.delete("content");
    q.delete("task");
    q.set(e.type === "task" ? "task" : "content", id);
    return scope === "space" ? `${basePath}?${q}` : `/o/${org}/s/${e.space.slug}/calendar?${q}`;
  };

  const placed = (e: CalendarEvent) => {
    const o = overrides[e.id];
    return o ? { ...e, date: o.date, minutes: o.minutes } : e;
  };
  const events = data.events.map(placed);
  const unscheduled = data.unscheduled.filter((e) => !overrides[e.id]);
  const moved = data.unscheduled.filter((e) => overrides[e.id]).map(placed);
  const all = [...events, ...moved];

  // Drop the optimistic positions once fresh data arrives.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverrides({});
  }, [data]);

  const color = (e: CalendarEvent) =>
    e.type === "task" ? "#9CA3AF" : colorBy === "status" ? (e.status?.color ?? "#9CA3AF") : e.platforms[0] ? PLATFORM_COLOR[e.platforms[0]] : "#9CA3AF";

  function commit(event: CalendarEvent, date: string, minutes: number) {
    const when = localValue(date, minutes);
    setOverrides((o) => ({ ...o, [event.id]: { date, minutes } }));
    setProblem(null);
    start(async () => {
      const result = await (event.type === "task" ? props.moveTask : props.moveContent)(event.space.slug, event.id, when, timeZone);
      if (!result.ok) {
        setOverrides((o) => {
          const next = { ...o };
          delete next[event.id];
          return next;
        });
        setProblem({ event, date, minutes, error: result.error, issues: result.issues });
      }
    });
  }

  function drop(date: string, minutes: number | null) {
    const event = drag;
    setDrag(null);
    setHint(null);
    if (!event) return;
    const at = minutes ?? event.minutes ?? 600;
    if (event.date === date && event.minutes === at) return;
    // OV-06: a post already scheduled to publish moves only after a confirmation.
    if (event.type === "content" && event.publishState === "scheduled") setConfirm({ event, date, minutes: at });
    else commit(event, date, at);
  }

  const dragProps = (e: CalendarEvent) =>
    props.canMove && e.movable
      ? {
          draggable: true,
          onDragStart: (ev: DragEvent) => {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", e.id);
            setHover(null);
            setDrag(e);
          },
          onDragEnd: () => {
            setDrag(null);
            setHint(null);
          },
        }
      : {};

  const hoverProps = (e: CalendarEvent) => ({
    onMouseEnter: (ev: React.MouseEvent) => {
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setHover({ event: e, rect }), 350);
    },
    onMouseLeave: () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setHover(null);
    },
  });

  const chip = (e: CalendarEvent, compact = false) => {
    const link = openHref(e);
    const mark = STATE_MARK[e.publishState];
    const body = (
      <>
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-l" style={{ background: color(e) }} />
        {e.type === "task" && <span aria-hidden>{e.done ? "☑" : "☐"}</span>}
        {e.minutes !== null && <span className="shrink-0 text-muted">{timeText(e.minutes)}</span>}
        <span className={`min-w-0 flex-1 truncate font-medium ${e.done ? "line-through text-muted" : ""}`}>{e.title}</span>
        {!compact && e.platforms.length > 1 && (
          <span aria-hidden className="flex gap-0.5">
            {e.platforms.slice(1).map((p) => (
              <span key={p} className="size-1.5 rounded-full" style={{ background: PLATFORM_COLOR[p] }} />
            ))}
          </span>
        )}
        {mark && (
          <span title={mark[1]} className={`shrink-0 text-[10px] font-bold ${e.publishState === "failed" || e.publishState === "partially_published" ? "text-danger" : e.publishState === "published" ? "text-success-ink" : "text-data"}`}>
            {mark[0]}
          </span>
        )}
      </>
    );
    const cls = `relative flex w-full items-center gap-1 overflow-hidden rounded-md border bg-surface py-1 pl-2.5 pr-1.5 text-left text-[12px] leading-tight hover:border-ink-2 ${
      e.type === "task" ? "border-dashed border-line" : "border-line"
    } ${drag?.id === e.id ? "opacity-40" : ""} ${props.canMove && e.movable ? "cursor-grab active:cursor-grabbing" : ""}`;
    const label = `${e.title}${e.minutes !== null ? `, ${timeText(e.minutes)}` : ""}${scope === "org" ? `, ${e.space.name}` : ""}`;
    return link ? (
      <Link key={e.id} href={link} scroll={false} aria-label={label} className={cls} {...dragProps(e)} {...hoverProps(e)}>
        {body}
      </Link>
    ) : (
      <span key={e.id} aria-label={label} className={cls} {...dragProps(e)} {...hoverProps(e)}>
        {body}
      </span>
    );
  };

  const dropProps = (date: string, minutesFor: ((ev: DragEvent<HTMLElement>) => number) | null) => ({
    onDragOver: (ev: DragEvent<HTMLElement>) => {
      if (!drag) return;
      ev.preventDefault();
      const m = minutesFor ? minutesFor(ev) : null;
      if (hint?.date !== date || hint.minutes !== m) setHint({ date, minutes: m });
    },
    onDrop: (ev: DragEvent<HTMLElement>) => {
      ev.preventDefault();
      drop(date, minutesFor ? minutesFor(ev) : null);
    },
  });

  const days = visibleDays(view, anchor, weekStart);
  const momentsOn = new Map<string, { name: string; approximate?: boolean }[]>();
  for (const m of props.moments ?? []) momentsOn.set(m.date, [...(momentsOn.get(m.date) ?? []), m]);
  const momentLabel = (date: string) =>
    (momentsOn.get(date) ?? []).map((m) => (
      <span key={m.name} title={m.approximate ? `${m.name} (date can vary by a day)` : m.name} className="block truncate rounded bg-accent-bg px-1.5 text-[11px] font-semibold text-accent-ink">
        🎉 {m.name}
      </span>
    ));
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of all) {
    if (!e.date) continue;
    byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  }
  for (const list of byDate.values()) list.sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:p-6">
      <Toolbar {...props} anchorTitle={title(view, anchor, weekStart)} href={href} prev={isoDate(shift(view, anchor, -1))} next={isoDate(shift(view, anchor, 1))} />

      {(problem || pending) && (
        <div role={problem ? "alert" : "status"} className={`flex flex-col gap-2 rounded-xl px-4 py-3 text-sm ${problem ? "bg-danger-bg text-danger" : "bg-subtle text-muted"}`}>
          {pending && !problem && "Saving…"}
          {problem && (
            <>
              <span className="flex flex-wrap items-center gap-2">
                <strong>Couldn’t move “{problem.event.title}”.</strong> {problem.error ?? "It isn’t ready to publish at that time."}
                <button type="button" onClick={() => commit(problem.event, problem.date, problem.minutes)} className={buttonClass("secondary", "sm")}>
                  Retry
                </button>
                <button type="button" onClick={() => setProblem(null)} className={buttonClass("ghost", "sm")}>
                  Dismiss
                </button>
              </span>
              {problem.issues && problem.issues.length > 0 && (
                <div className="text-ink">
                  <IssueList issues={problem.issues} org={org} space={problem.event.space.slug} onFix={() => problem.event.contentId && router.push(openHref(problem.event)!)} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {(view === "day" || view === "week") && (
          <aside className="hidden w-[220px] shrink-0 flex-col gap-4 lg:flex">
            {view === "day" && <MiniMonth anchor={props.date} today={props.today} weekStart={weekStart} href={href} />}
            <Tray events={unscheduled} canMove={props.canMove} render={(e) => chip(e, true)} />
          </aside>
        )}

        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface">
          {view === "month" && (
            <div className="flex h-full flex-col">
              <div className="grid grid-cols-7 border-b border-line bg-subtle text-xs font-semibold text-muted">
                {weekdayHeaders(weekStart).map((d) => (
                  <div key={d} className="px-2 py-2">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid flex-1 grid-cols-7" style={{ gridAutoRows: "minmax(112px, 1fr)" }}>
                {days.map((d) => {
                  const key = isoDate(d);
                  const list = byDate.get(key) ?? [];
                  const inMonth = d.month === anchor.month;
                  const isHint = hint?.date === key;
                  return (
                    <div
                      key={key}
                      {...dropProps(key, null)}
                      className={`flex min-w-0 flex-col gap-1 border-b border-r border-line-soft p-1.5 ${inMonth ? "" : "bg-subtle/60"} ${isHint ? "bg-data-bg" : ""}`}
                    >
                      <Link
                        href={href({ view: "day", date: key })}
                        className={`grid size-6 place-items-center self-start rounded-full text-xs font-semibold ${key === props.today ? "bg-ink text-white" : inMonth ? "text-ink" : "text-faint"}`}
                        aria-label={dayLabel(d, { weekday: "long", day: "numeric", month: "long" })}
                      >
                        {d.day}
                      </Link>
                      {momentLabel(key)}
                      {list.slice(0, 3).map((e) => chip(e, true))}
                      {list.length > 3 && (
                        <Link href={href({ view: "day", date: key })} className="px-1 text-[11px] font-semibold text-muted hover:text-ink">
                          +{list.length - 3} more
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(view === "week" || view === "day") && (
            <TimeGrid
              days={days}
              today={props.today}
              nowMinutes={props.nowMinutes}
              byDate={byDate}
              href={href}
              hint={hint}
              momentLabel={momentLabel}
              dropProps={dropProps}
              render={(e) => chip(e)}
            />
          )}

          {view === "list" && (
            <div className="divide-y divide-line-soft">
              {days.filter((d) => byDate.has(isoDate(d))).length === 0 && (
                <p className="px-5 py-16 text-center text-sm text-muted">Nothing on the calendar in {title("month", anchor)}.</p>
              )}
              {days
                .filter((d) => byDate.has(isoDate(d)))
                .map((d) => (
                  <section key={isoDate(d)} className="flex flex-col gap-1 px-4 py-3 md:flex-row md:gap-4">
                    <Link href={href({ view: "day", date: isoDate(d) })} className={`w-32 shrink-0 text-sm font-semibold ${isoDate(d) === props.today ? "text-data" : ""}`}>
                      {dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}
                    </Link>
                    <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {byDate.get(isoDate(d))!.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1">
                            {chip(e)}
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {e.kinds.map((k) => (
                              <PlacementChip key={k} kind={k} />
                            ))}
                          </span>
                          {scope === "org" && <span className="text-xs text-muted">{e.space.name}</span>}
                          {e.status && <span className="text-xs text-muted">{e.status.name}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          )}
        </div>
      </div>

      {view === "month" && unscheduled.length > 0 && (
        <p className="text-[13px] text-muted">
          {unscheduled.length} unscheduled post{unscheduled.length === 1 ? "" : "s"}.{" "}
          <Link href={href({ view: "week" })} className="font-semibold underline">
            Open Week view
          </Link>{" "}
          to drag {unscheduled.length === 1 ? "it" : "them"} onto a day.
        </p>
      )}

      {hover && !drag && <HoverCard hover={hover} scope={scope} org={org} />}

      {confirm && (
        <ConfirmMove
          event={confirm.event}
          to={`${dayLabel(parseDate(confirm.date)!, { weekday: "short", day: "numeric", month: "short" })}, ${timeText(confirm.minutes)}`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            commit(confirm.event, confirm.date, confirm.minutes);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function Toolbar(props: Props & { anchorTitle: string; href: (c: Record<string, string | null>) => string; prev: string; next: string }) {
  const { view, href, filters, colorBy, weekStart } = props;
  const router = useRouter();
  const [, start] = useTransition();
  const active = [filters.type !== "all", filters.who !== "anyone", filters.state !== "any", filters.autopost, filters.category !== "any"].filter(Boolean).length;
  const setFilter = (k: string, v: string | null) => router.push(href({ [k]: v }), { scroll: false });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={href({ date: null })} className={buttonClass("secondary", "sm")}>
        Today
      </Link>
      <span className="flex">
        <Link href={href({ date: props.prev })} aria-label="Previous" className={`${buttonClass("ghost", "sm")} px-2`}>
          ‹
        </Link>
        <Link href={href({ date: props.next })} aria-label="Next" className={`${buttonClass("ghost", "sm")} px-2`}>
          ›
        </Link>
      </span>
      <h2 className="mr-2 font-display text-xl font-bold">{props.anchorTitle}</h2>
      <span className="flex-1" />

      {props.spaces && (
        <Popover label={`Calendars · ${props.spaces.filter((s) => s.selected).length} of ${props.spaces.length}`}>
          <p className="mb-2 text-xs font-semibold text-muted">Select calendar</p>
          {props.spaces.map((s) => {
            const selected = props.spaces!.filter((x) => x.selected).map((x) => x.slug);
            const next = s.selected ? selected.filter((x) => x !== s.slug) : [...selected, s.slug];
            return (
              <Link
                key={s.slug}
                href={href({ spaces: next.length === props.spaces!.length || next.length === 0 ? null : next.join(",") })}
                scroll={false}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-subtle"
              >
                <span className={`grid size-4 place-items-center rounded border text-[10px] ${s.selected ? "border-ink bg-ink text-white" : "border-faint"}`}>{s.selected ? "✓" : ""}</span>
                <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </Link>
            );
          })}
        </Popover>
      )}

      <Popover label={active ? `Filter · ${active}` : "Filter"}>
        <div className="grid w-64 gap-3 text-sm">
          <Select label="Show" value={filters.type} onChange={(v) => setFilter("type", v === "all" ? null : v)} options={[["all", "Content and tasks"], ["content", "Content"], ["tasks", "Tasks"]]} />
          <Select
            label="Assigned to"
            value={filters.who}
            onChange={(v) => setFilter("who", v === "anyone" ? null : v)}
            options={[["anyone", "Anyone"], ["me", "Assigned to me"], ["unassigned", "Unassigned"], ...props.data.members.map((m) => [m.id, m.name] as [string, string])]}
          />
          <Select
            label="Publishing"
            value={filters.state}
            onChange={(v) => setFilter("state", v === "any" ? null : v)}
            options={[["any", "Any"], ["scheduled", "Scheduled"], ["unscheduled", "Not scheduled"], ["published", "Published"], ["failed", "Failed"]]}
          />
          <Select
            label="Status category"
            value={filters.category}
            onChange={(v) => setFilter("cat", v === "any" ? null : v)}
            options={[["any", "Any"], ["not_started", "Not started"], ["active", "Active"], ["completed", "Completed"], ["closed", "Closed"]]}
          />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.autopost} onChange={(e) => setFilter("autopost", e.target.checked ? "1" : null)} className="accent-ink" />
            Autopost on only
          </label>
          {active > 0 && (
            <Link href={href({ type: null, who: null, state: null, cat: null, autopost: null })} className="text-xs font-semibold text-muted underline">
              Clear filters
            </Link>
          )}
        </div>
      </Popover>

      <Popover label="View options">
        <div className="grid w-56 gap-3 text-sm">
          <Select
            label="Colour items by"
            value={colorBy}
            onChange={(v) => start(async () => props.setPrefs({ calendarColor: v as "platform" | "status" }))}
            options={[["platform", "Platform"], ["status", "Status"]]}
          />
          <Select
            label="Week starts on"
            value={String(weekStart)}
            onChange={(v) => start(async () => props.setPrefs({ weekStartsOn: Number(v) as WeekStart }))}
            options={[["0", "Monday"], ["6", "Sunday"]]}
          />
        </div>
      </Popover>

      <nav aria-label="Calendar view" className="flex gap-0.5 rounded-lg bg-line-soft p-[3px]">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={href({ view: v === "month" ? null : v })}
            aria-current={view === v ? "page" : undefined}
            className={`rounded-md px-3 py-1 text-[13px] font-semibold ${view === v ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </nav>

      {colorBy === "platform" && (
        <span className="flex w-full flex-wrap items-center gap-3 text-xs text-muted">
          {(Object.keys(PLATFORM_COLOR) as Platform[]).map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: PLATFORM_COLOR[p] }} />
              {PLATFORM_NAMES[p]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-dashed border-faint" />
            Task
          </span>
          <span>⏱ scheduled to publish · ✓ published · ! failed</span>
        </span>
      )}
    </div>
  );
}

function Popover({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className={`${buttonClass("secondary", "sm")} cursor-pointer list-none`}>{label}</summary>
      <div className="absolute right-0 z-30 mt-1.5 rounded-xl border border-line bg-surface p-3 shadow-xl">{children}</div>
    </details>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimeGrid({
  days,
  today,
  nowMinutes,
  byDate,
  href,
  hint,
  momentLabel,
  dropProps,
  render,
}: {
  momentLabel: (date: string) => ReactNode;
  days: ReturnType<typeof visibleDays>;
  today: string;
  nowMinutes: number;
  byDate: Map<string, CalendarEvent[]>;
  href: (c: Record<string, string | null>) => string;
  hint: { date: string; minutes: number | null } | null;
  dropProps: (date: string, minutesFor: ((ev: DragEvent<HTMLElement>) => number) | null) => object;
  render: (e: CalendarEvent) => ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstEvent = Math.min(...days.flatMap((d) => (byDate.get(isoDate(d)) ?? []).map((e) => e.minutes ?? 1440)), 1440);
  const rangeKey = `${days.length}:${isoDate(days[0])}`;
  useEffect(() => {
    // Start at 7 AM, or earlier if something is on before then; after layout, so the grid can scroll.
    const frame = requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = (Math.min(7 * 60, firstEvent) / 60) * HOUR_PX - 8;
    });
    return () => cancelAnimationFrame(frame);
    // Only when the visible range changes, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const minutesFor = (ev: DragEvent<HTMLElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    return minutesAt((ev.clientY - rect.top) / rect.height);
  };

  return (
    <div className="flex h-full max-h-[calc(100vh-240px)] min-h-[480px] flex-col">
      <div className="grid overflow-hidden border-b border-line bg-subtle" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, scrollbarGutter: "stable" }}>
        <span />
        {days.map((d) => (
          <div key={isoDate(d)} className="flex min-w-0 flex-col gap-0.5 px-2 py-2">
            <Link href={href({ view: "day", date: isoDate(d) })} className="flex items-baseline gap-1.5 text-xs font-semibold text-muted hover:text-ink">
              {dayLabel(d)}
              <span className={`grid size-6 place-items-center rounded-full text-sm ${isoDate(d) === today ? "bg-ink text-white" : "text-ink"}`}>{d.day}</span>
            </Link>
            {momentLabel(isoDate(d))}
          </div>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint" style={{ top: (h + 1) * HOUR_PX }}>
                {timeText((h + 1) * 60)}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const key = isoDate(d);
            const list = byDate.get(key) ?? [];
            const lanes = layoutLanes(list.map((e) => ({ id: e.id, minutes: e.minutes ?? 0 })));
            return (
              <div
                key={key}
                {...dropProps(key, minutesFor)}
                className="relative border-l border-line-soft"
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--color-line-soft) ${HOUR_PX - 1}px, var(--color-line-soft) ${HOUR_PX}px)` }}
              >
                {key === today && (
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger" style={{ top: (nowMinutes / 60) * HOUR_PX }} />
                )}
                {hint?.date === key && hint.minutes !== null && (
                  <span className="pointer-events-none absolute inset-x-1 z-10 rounded border-2 border-dashed border-data bg-data-bg/60 px-1 text-[11px] font-semibold text-data" style={{ top: (hint.minutes / 60) * HOUR_PX, height: HOUR_PX * 0.75 }}>
                    {timeText(hint.minutes)}
                  </span>
                )}
                {list.map((e) => {
                  const l = lanes.get(e.id)!;
                  return (
                    <div
                      key={e.id}
                      className="absolute px-0.5"
                      style={{ top: ((e.minutes ?? 0) / 60) * HOUR_PX, left: `${(l.lane / l.lanes) * 100}%`, width: `${100 / l.lanes}%` }}
                    >
                      {render(e)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniMonth({ anchor, today, weekStart, href }: { anchor: string; today: string; weekStart: WeekStart; href: (c: Record<string, string | null>) => string }) {
  const a = parseDate(anchor)!;
  const days = visibleDays("month", a, weekStart);
  return (
    <section aria-label="Pick a day" className="rounded-xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold">
        <Link href={href({ date: isoDate(shift("month", a, -1)) })} aria-label="Previous month" className="px-1 text-muted hover:text-ink">
          ‹
        </Link>
        {title("month", a)}
        <Link href={href({ date: isoDate(shift("month", a, 1)) })} aria-label="Next month" className="px-1 text-muted hover:text-ink">
          ›
        </Link>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px]">
        {weekdayHeaders(weekStart).map((d) => (
          <span key={d} className="py-1 text-faint">
            {d[0]}
          </span>
        ))}
        {days.map((d) => {
          const key = isoDate(d);
          return (
            <Link
              key={key}
              href={href({ date: key })}
              className={`m-0.5 grid aspect-square place-items-center rounded-full ${key === anchor ? "bg-ink text-white" : key === today ? "font-bold text-data" : d.month === a.month ? "hover:bg-subtle" : "text-faint"}`}
            >
              {d.day}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Tray({ events, canMove, render }: { events: CalendarEvent[]; canMove: boolean; render: (e: CalendarEvent) => ReactNode }) {
  return (
    <section aria-label="Unscheduled" className="flex min-h-0 flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <h3 className="text-sm font-semibold">
        Unscheduled <span className="font-normal text-muted">· {events.length}</span>
      </h3>
      {events.length === 0 ? (
        <p className="text-xs text-muted">Everything has a date.</p>
      ) : (
        <>
          {canMove && <p className="text-xs text-muted">Drag onto a time to plan it.</p>}
          <ul className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
            {events.map((e) => (
              <li key={e.id}>{render(e)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function HoverCard({ hover, scope, org }: { hover: { event: CalendarEvent; rect: DOMRect }; scope: "space" | "org"; org: string }) {
  const e = hover.event;
  const width = 280;
  const card = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(hover.rect.bottom + 8);
  const left = Math.min(Math.max(8, hover.rect.left), window.innerWidth - width - 8);
  // Below the item, or above it when there isn't room (measured once it has rendered).
  useLayoutEffect(() => {
    const height = card.current?.offsetHeight ?? 0;
    const below = hover.rect.bottom + 8;
    setTop(below + height > window.innerHeight - 8 ? Math.max(8, hover.rect.top - height - 8) : below);
  }, [hover]);
  return (
    <div ref={card} role="tooltip" className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" style={{ left, top, width }}>
      {e.coverId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/o/${org}/s/${e.space.slug}/media/${e.coverId}?v=thumb`} alt="" className="h-28 w-full object-cover" />
      )}
      <div className="flex flex-col gap-1.5 p-3 text-[13px]">
        <strong className="text-sm">{e.title}</strong>
        <span className="text-muted">
          {[scope === "org" ? e.space.name : null, e.minutes !== null ? timeText(e.minutes) : "No time yet", e.type === "task" ? "Task" : e.status?.name].filter(Boolean).join(" · ")}
        </span>
        {e.kinds.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {e.kinds.map((k) => (
              <PlacementChip key={k} kind={k} />
            ))}
          </span>
        )}
        {e.type === "content" && (
          <span className="text-xs text-ink-2">
            {STATE_MARK[e.publishState]?.[1] ?? "Not scheduled to publish"}
            {e.publishState === "scheduled" ? (e.autopost ? " · autopost" : " · reminder") : ""}
          </span>
        )}
        {e.caption && <p className="line-clamp-3 text-ink-2">{e.caption}</p>}
        {e.assignees.length > 0 && <span className="text-xs text-muted">{e.assignees.map((a) => a.name).join(", ")}</span>}
      </div>
    </div>
  );
}

function ConfirmMove({ event, to, onCancel, onConfirm }: { event: CalendarEvent; to: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={onCancel} aria-labelledby="move-title" className="m-auto w-[min(440px,92vw)] rounded-2xl bg-surface p-5 text-ink shadow-2xl backdrop:bg-ink/40">
      <h2 id="move-title" className="font-display text-lg font-bold">
        Move a scheduled post?
      </h2>
      <p className="mt-2 text-sm text-ink-2">
        “{event.title}” is scheduled to {event.autopost ? "publish automatically" : "send a reminder"}. It will move to <strong>{to}</strong>, after the same checks as scheduling.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} className={buttonClass("ghost")}>
          Keep the time
        </button>
        <button type="button" onClick={onConfirm} className={buttonClass("primary")}>
          Move post
        </button>
      </div>
    </dialog>
  );
}
