import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, fold } from "./ics";

describe("calendar feed (iCalendar)", () => {
  it("escapes text and folds long lines at 75 octets", () => {
    expect(escapeText("Diwali, sweets; 20%\nnew line\\")).toBe("Diwali\\, sweets\\; 20%\\nnew line\\\\");
    const folded = fold(`SUMMARY:${"दिवाली ".repeat(20)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });

  it("writes events in UTC with CRLF line endings", () => {
    const ics = buildCalendar("Plotline · Cafe", [
      { uid: "a@plotline", start: new Date("2026-11-08T13:30:00Z"), minutes: 30, summary: "[Cafe] Happy Diwali", url: "https://app/x", updated: new Date("2026-10-01T00:00:00Z") },
    ], new Date("2026-10-06T10:00:00Z"));
    expect(ics).toContain("DTSTART:20261108T133000Z\r\nDTEND:20261108T140000Z");
    expect(ics).toContain("X-WR-CALNAME:Plotline · Cafe");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.includes("\n") && !/[^\r]\n/.test(ics)).toBe(true);
  });
});
