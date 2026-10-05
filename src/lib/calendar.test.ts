import { describe, expect, it } from "vitest";
import { isoDate } from "@/lib/analytics/time";
import { layoutLanes, localValue, minutesAt, parseDate, shift, title, visibleDays, weekdayHeaders } from "./calendar";

const d = (s: string) => parseDate(s)!;
const iso = (days: { year: number; month: number; day: number }[]) => days.map(isoDate);

describe("calendar geometry", () => {
  it("parses only real dates", () => {
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("nonsense")).toBeNull();
    expect(parseDate("2026-10-05")).toEqual({ year: 2026, month: 10, day: 5 });
  });

  it("shows whole weeks for a month, starting Monday or Sunday", () => {
    const mon = visibleDays("month", d("2026-10-05"), 0);
    expect(isoDate(mon[0])).toBe("2026-09-28");
    expect(isoDate(mon.at(-1)!)).toBe("2026-11-01");
    expect(mon.length % 7).toBe(0);
    const sun = visibleDays("month", d("2026-10-05"), 6);
    expect(isoDate(sun[0])).toBe("2026-09-27");
    expect(isoDate(sun.at(-1)!)).toBe("2026-10-31");
  });

  it("shows a week, a day and a month list", () => {
    expect(iso(visibleDays("week", d("2026-10-07"), 0))).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(iso(visibleDays("day", d("2026-10-07")))).toEqual(["2026-10-07"]);
    expect(visibleDays("list", d("2026-02-10"))).toHaveLength(28);
  });

  it("moves between periods, clamping month ends", () => {
    expect(shift("month", d("2026-01-31"), 1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(shift("month", d("2026-01-15"), -1)).toEqual({ year: 2025, month: 12, day: 15 });
    expect(isoDate(shift("week", d("2026-12-30"), 1))).toBe("2027-01-06");
    expect(isoDate(shift("day", d("2026-03-01"), -1))).toBe("2026-02-28");
  });

  it("titles each view", () => {
    expect(title("month", d("2026-10-05"))).toBe("October 2026");
    expect(title("week", d("2026-10-07"))).toBe("5 – 11 Oct 2026");
    expect(title("week", d("2026-09-30"))).toBe("28 Sept – 4 Oct 2026");
    expect(title("day", d("2026-10-05"))).toBe("Monday, 5 October 2026");
    expect(weekdayHeaders(6)[0]).toBe("Sun");
  });

  it("turns drops into local times, snapped to 15 minutes", () => {
    expect(minutesAt(0.5)).toBe(720);
    expect(minutesAt(0.501)).toBe(720);
    expect(minutesAt(1)).toBe(1425);
    expect(localValue("2026-10-05", 19 * 60 + 30)).toBe("2026-10-05T19:30");
  });

  it("puts overlapping items side by side", () => {
    const lanes = layoutLanes([
      { id: "a", minutes: 600 },
      { id: "b", minutes: 615 },
      { id: "c", minutes: 700 },
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get("c")).toEqual({ lane: 0, lanes: 1 });
  });
});
