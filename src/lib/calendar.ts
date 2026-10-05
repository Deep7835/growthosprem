// Calendar geometry (OV-04, VW-04): which days a view shows, its title, moving between
// periods, and where items sit in a time grid. Pure, on local (timezone-free) dates.
import { addDays, isoDate, type LocalDate } from "@/lib/analytics/time";

export type CalendarView = "month" | "week" | "day" | "list";
export const VIEWS: CalendarView[] = ["month", "week", "day", "list"];

/** 0 = weeks start on Monday, 6 = on Sunday (Profile › calendar preferences). */
export type WeekStart = 0 | 6;

export function parseDate(value: string | undefined | null): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = addDays(d, 0);
  return check.year === d.year && check.month === d.month && check.day === d.day ? d : null;
}

const weekday = (d: LocalDate) => addDays(d, 0).weekday;

function startOfWeek(d: LocalDate, weekStart: WeekStart) {
  const offset = (weekday(d) - weekStart + 7) % 7;
  return addDays(d, -offset);
}

/** Days shown by a view: full weeks for a month, 7 for a week, 1 for a day, the month for a list. */
export function visibleDays(view: CalendarView, anchor: LocalDate, weekStart: WeekStart = 0): LocalDate[] {
  if (view === "day") return [addDays(anchor, 0)];
  if (view === "week") {
    const start = startOfWeek(anchor, weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = { year: anchor.year, month: anchor.month, day: 1 };
  const daysInMonth = new Date(Date.UTC(anchor.year, anchor.month, 0)).getUTCDate();
  if (view === "list") return Array.from({ length: daysInMonth }, (_, i) => addDays(first, i));
  const start = startOfWeek(first, weekStart);
  const last = { year: anchor.year, month: anchor.month, day: daysInMonth };
  const end = addDays(startOfWeek(last, weekStart), 6);
  const days: LocalDate[] = [];
  for (let d = addDays(start, 0); isoDate(d) <= isoDate(end); d = addDays(d, 1)) days.push(d);
  return days;
}

/** The anchor one period earlier (-1) or later (+1). Months clamp the day (31 Jan → 28 Feb). */
export function shift(view: CalendarView, anchor: LocalDate, dir: -1 | 1): LocalDate {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  const month = anchor.month + dir;
  const year = anchor.year + Math.floor((month - 1) / 12);
  const m = ((((month - 1) % 12) + 12) % 12) + 1;
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { year, month: m, day: Math.min(anchor.day, days) };
}

const fmt = (d: LocalDate, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(d.year, d.month - 1, d.day)));

export function title(view: CalendarView, anchor: LocalDate, weekStart: WeekStart = 0): string {
  if (view === "day") return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "week") {
    const days = visibleDays("week", anchor, weekStart);
    const [a, b] = [days[0], days[6]];
    if (a.year !== b.year) return `${fmt(a, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
    if (a.month !== b.month) return `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
    return `${a.day} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return fmt(anchor, { month: "long", year: "numeric" });
}

export const dayLabel = (d: LocalDate, opts: Intl.DateTimeFormatOptions = { weekday: "short" }) => fmt(d, opts);

export function weekdayHeaders(weekStart: WeekStart = 0) {
  const monday = { year: 2026, month: 1, day: 5 };
  return Array.from({ length: 7 }, (_, i) => fmt(addDays(monday, i + weekStart), { weekday: "short" }));
}

/** "YYYY-MM-DDTHH:mm" for a drop on a day at `minutes` past midnight. */
export function localValue(date: string, minutes: number) {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes past midnight for a drop `fraction` of the way down a day column, snapped to 15 minutes. */
export function minutesAt(fraction: number, snap = 15) {
  const m = Math.round((Math.max(0, Math.min(1, fraction)) * 1440) / snap) * snap;
  return Math.min(m, 1440 - snap);
}

/**
 * Lanes for overlapping items in a time grid: each item gets a lane and the number of lanes
 * in its cluster, so overlapping posts sit side by side. Items last `duration` minutes.
 */
export function layoutLanes<T extends { id: string; minutes: number }>(items: T[], duration = 45) {
  const sorted = [...items].sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id));
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: T[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    for (const it of cluster) out.get(it.id)!.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const it of sorted) {
    if (it.minutes >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= it.minutes);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = it.minutes + duration;
    clusterEnd = Math.max(clusterEnd, it.minutes + duration);
    cluster.push(it);
    out.set(it.id, { lane, lanes: 0 });
  }
  close();
  return out;
}
