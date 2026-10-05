// Search palette helpers (SR-01..SR-03), shared by the server and the palette.

export const GROUPS = [
  ["content", "Content"],
  ["task", "Tasks"],
  ["project", "Projects"],
  ["space", "Spaces"],
  ["note", "Notes"],
  ["idea", "Ideas"],
] as const;

/** The text around the first match, on one line: "…the Diwali hamper is back…". */
export function snippet(text: string, query: string, before = 40, after = 80): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  const q = query.trim().toLowerCase();
  if (!flat || !q) return null;
  const at = flat.toLowerCase().indexOf(q);
  if (at < 0) return null;
  let start = Math.max(0, at - before);
  let end = Math.min(flat.length, at + q.length + after);
  // Don't cut words in half.
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    if (space > -1 && space < at) start = space + 1;
  }
  if (end < flat.length) {
    const space = flat.lastIndexOf(" ", end);
    if (space > at + q.length) end = space;
  }
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** Splits text around matches of the query, for highlighting. */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) break;
    if (at > i) parts.push({ text: text.slice(i, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    i = at + needle.length;
  }
  if (i < text.length) parts.push({ text: text.slice(i), match: false });
  return parts;
}

/** "just now", "5m", "3h", "2d", "4 Oct". */
export function shortAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const future = then > now;
  const minutes = Math.round(Math.abs(now - then) / 60000);
  const tag = (s: string) => (future ? `in ${s}` : `${s} ago`);
  if (minutes < 1) return "just now";
  if (minutes < 60) return tag(`${minutes}m`);
  if (minutes < 1440) return tag(`${Math.round(minutes / 60)}h`);
  if (minutes < 10080) return tag(`${Math.round(minutes / 1440)}d`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(iso));
}
