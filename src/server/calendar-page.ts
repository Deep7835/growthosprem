import "server-only";
import { isoDate, zonedParts } from "@/lib/analytics/time";
import { parseDate, VIEWS, type CalendarView, type WeekStart } from "@/lib/calendar";

type Query = Record<string, string | string[] | undefined>;

/** View, date and preferences for a calendar page, from the URL and the user's profile. */
export function calendarSettings(query: Query, opts: { timeZone: string; requestTime: number; preferences: { calendarColor?: "platform" | "status"; weekStartsOn?: 0 | 6 } }) {
  const one = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : undefined);
  const view = (VIEWS as string[]).includes(one("view") ?? "") ? (one("view") as CalendarView) : "month";
  const now = zonedParts(new Date(opts.requestTime), opts.timeZone);
  const today = isoDate(now);
  const anchor = parseDate(one("date")) ?? { year: now.year, month: now.month, day: now.day };
  const plain = Object.fromEntries(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "content"));
  return {
    view,
    anchor,
    date: isoDate(anchor),
    today,
    nowMinutes: now.hour * 60 + now.minute,
    weekStart: (opts.preferences.weekStartsOn ?? 0) as WeekStart,
    colorBy: opts.preferences.calendarColor ?? "platform",
    query: plain,
  };
}
