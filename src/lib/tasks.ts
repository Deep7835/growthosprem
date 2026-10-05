// Task rules shared by the server and the UI (PRD 6.8, TK-01, TK-04).
import { PLACEMENTS, type PlacementKind } from "./placements";

export type Priority = "low" | "medium" | "high" | "urgent";

export const PRIORITIES: { id: Priority; label: string; tone: string }[] = [
  { id: "low", label: "Low", tone: "text-muted" },
  { id: "medium", label: "Medium", tone: "text-ink-2" },
  { id: "high", label: "High", tone: "text-warn-ink" },
  { id: "urgent", label: "Urgent", tone: "text-danger" },
];

export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.id, p.label])) as Record<Priority, string>;
const RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const priorityRank = (p: Priority) => RANK[p];

/** A task is done when its status is in Completed or Closed. */
export const isDoneCategory = (category: string) => category === "completed" || category === "closed";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Keeps up to 50 non-empty items with unique ids. */
export function cleanChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.trim().slice(0, 200) : "";
    const id = typeof r.id === "string" && /^[\w-]{1,40}$/.test(r.id) ? r.id : "";
    if (!text || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, text, done: r.done === true });
    if (out.length === 50) break;
  }
  return out;
}

/* ---------- Templates (TK-04) ---------- */

export type TemplateFormat = "reel" | "carousel" | "post" | "story";

/** Each step and how many days before the publish date it is due. */
export const TASK_TEMPLATES: Record<TemplateFormat, { label: string; steps: { title: string; daysBefore: number }[] }> = {
  reel: {
    label: "Reel",
    steps: [
      { title: "Script", daysBefore: 6 },
      { title: "Shoot", daysBefore: 5 },
      { title: "Edit", daysBefore: 3 },
      { title: "Thumbnail", daysBefore: 3 },
      { title: "Client approval", daysBefore: 2 },
      { title: "Publish", daysBefore: 0 },
    ],
  },
  carousel: {
    label: "Carousel",
    steps: [
      { title: "Outline the slides", daysBefore: 5 },
      { title: "Write the copy", daysBefore: 4 },
      { title: "Design", daysBefore: 3 },
      { title: "Client approval", daysBefore: 2 },
      { title: "Publish", daysBefore: 0 },
    ],
  },
  post: {
    label: "Post",
    steps: [
      { title: "Write the caption", daysBefore: 4 },
      { title: "Design or pick the photo", daysBefore: 3 },
      { title: "Client approval", daysBefore: 2 },
      { title: "Publish", daysBefore: 0 },
    ],
  },
  story: {
    label: "Story",
    steps: [
      { title: "Design", daysBefore: 2 },
      { title: "Publish", daysBefore: 0 },
    ],
  },
};

/** The template for a post's platforms: the most involved format wins (a Reel and a Post → Reel). */
export function formatForPlacements(kinds: PlacementKind[]): TemplateFormat {
  const has = (f: string) => kinds.some((k) => PLACEMENTS[k].label.toLowerCase().includes(f));
  if (has("reel")) return "reel";
  if (has("carousel")) return "carousel";
  if (kinds.length > 0 && kinds.every((k) => PLACEMENTS[k].label.toLowerCase().includes("story"))) return "story";
  return "post";
}

/**
 * The tasks a template adds: due dates counted back from the publish date, at the same time
 * of day, never in the past (those are due now). Steps already on the post are skipped.
 */
export function planTemplate(
  format: TemplateFormat,
  publishAt: Date | null,
  now: Date,
  existing: { title: string; templateKey: string | null }[],
): { title: string; dueAt: Date | null; templateKey: string }[] {
  const have = new Set(existing.flatMap((t) => [t.templateKey, t.title.trim().toLowerCase()]).filter(Boolean));
  return TASK_TEMPLATES[format].steps
    .map((step) => ({ ...step, templateKey: `${format}:${step.title.toLowerCase().replace(/\s+/g, "-")}` }))
    .filter((step) => !have.has(step.templateKey) && !have.has(step.title.toLowerCase()))
    .map((step) => {
      if (!publishAt) return { title: step.title, dueAt: null, templateKey: step.templateKey };
      const due = new Date(publishAt.getTime() - step.daysBefore * 864e5);
      return { title: step.title, dueAt: due < now ? now : due, templateKey: step.templateKey };
    });
}

/** "Overdue", "Due today", "Due tomorrow" or null, in the space's time zone. */
export function dueState(dueAt: Date | null, done: boolean, now: Date, timeZone: string): "overdue" | "today" | "tomorrow" | null {
  if (!dueAt || done) return null;
  if (dueAt.getTime() < now.getTime()) return "overdue";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (day(dueAt) === day(now)) return "today";
  if (day(dueAt) === day(new Date(now.getTime() + 864e5))) return "tomorrow";
  return null;
}

/** An ISO time as the value of a datetime-local input in the space's time zone: "2026-10-12T18:00". */
export function localInput(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** "Mon 12 Oct, 6:00 PM" in the space's time zone. */
export function formatDue(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso))
    .replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}
