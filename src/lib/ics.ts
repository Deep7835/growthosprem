// A small iCalendar (RFC 5545) writer for the calendar feed: events with UTC times, escaped text
// and lines folded at 75 octets, joined with CRLF.

export interface IcsEvent {
  uid: string;
  start: Date;
  minutes: number;
  summary: string;
  description?: string;
  url?: string;
  updated: Date;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Folds a content line so no line is longer than 75 octets (continuations start with a space). */
export function fold(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Plotline//Calendar feed//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.minutes * 60000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(e.updated)}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
