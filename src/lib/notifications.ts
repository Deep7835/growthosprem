// Notification types, defaults and preference rules (PRD 6.18, NT-01..NT-04). Pure, so the
// web server, the job worker and tests share it.

export type NotificationType = "action_required" | "comments" | "content" | "tasks" | "review" | "publishing" | "account" | "ai" | "system";
export type Channels = { inApp: boolean; email: boolean; push: boolean };
/** What a saved table holds; `push` is missing in tables saved before push existed. */
export type SavedChannels = { inApp: boolean; email: boolean; push?: boolean };
export type TypePrefs = Partial<Record<NotificationType, SavedChannels>>;
export interface NotificationSettingsDoc {
  types?: TypePrefs;
  digest?: boolean;
  timeZone?: string;
}

export const TYPES: { id: NotificationType; label: string; hint: string; defaults: Channels }[] = [
  { id: "action_required", label: "Action required", hint: "A post failed, it’s time to post by hand, or an account needs reconnecting", defaults: { inApp: true, email: true, push: true } },
  { id: "comments", label: "Comments and mentions", hint: "Someone comments on your post or task, or @mentions you", defaults: { inApp: true, email: true, push: true } },
  { id: "content", label: "Content updates", hint: "You’re assigned to a post, or its status changes", defaults: { inApp: true, email: false, push: false } },
  { id: "tasks", label: "Task updates", hint: "You’re given a task, or one of yours is due tomorrow or overdue", defaults: { inApp: true, email: false, push: true } },
  { id: "review", label: "Client review", hint: "A client approves or asks for changes", defaults: { inApp: true, email: true, push: true } },
  { id: "publishing", label: "Publishing", hint: "A post was published", defaults: { inApp: true, email: false, push: false } },
  { id: "account", label: "Social account", hint: "Access to an account is about to expire", defaults: { inApp: true, email: true, push: true } },
  { id: "ai", label: "AI Copilot", hint: "Your AI budget is nearly or fully used", defaults: { inApp: true, email: false, push: false } },
  { id: "system", label: "System", hint: "Trial, billing and product notices", defaults: { inApp: true, email: false, push: false } },
];

export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label])) as Record<NotificationType, string>;

/** Which type each event belongs to. Unknown kinds count as System. */
const KIND_TYPE: Record<string, NotificationType> = {
  publish_failed: "action_required",
  publish_reminder: "action_required",
  account_reconnect: "action_required",
  mention: "comments",
  comment: "comments",
  assigned: "content",
  status_changed: "content",
  task_assigned: "tasks",
  task_comment: "comments",
  task_due: "tasks",
  task_overdue: "tasks",
  review_approved: "review",
  review_changes: "review",
  published: "publishing",
  account_expiring: "account",
  ai_budget: "ai",
};

export function typeOf(kind: string): NotificationType {
  return KIND_TYPE[kind] ?? "system";
}

export function kindsOf(type: NotificationType): string[] {
  return Object.entries(KIND_TYPE)
    .filter(([, t]) => t === type)
    .map(([k]) => k);
}

const isType = (t: string): t is NotificationType => TYPES.some((x) => x.id === t);

/** Keeps known types with boolean channels; Action required is always in-app (NT-03). */
export function cleanPrefs(input: unknown): TypePrefs {
  const out: TypePrefs = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isType(k) || !v || typeof v !== "object") continue;
    const c = v as Record<string, unknown>;
    out[k] = { inApp: k === "action_required" ? true : c.inApp === true, email: c.email === true, ...(typeof c.push === "boolean" ? { push: c.push } : {}) };
  }
  return out;
}

/** The channels for one event: the space's own setting, else the person's default, else ours. */
export function channelsFor(type: NotificationType, own: { space?: TypePrefs | null; base?: TypePrefs | null }): Channels {
  const defaults = TYPES.find((t) => t.id === type)!.defaults;
  const saved = own.space?.[type] ?? own.base?.[type];
  const chosen: Channels = saved ? { inApp: saved.inApp, email: saved.email, push: saved.push ?? defaults.push } : defaults;
  return type === "action_required" ? { ...chosen, inApp: true } : chosen;
}

/** The full table for a scope, filling gaps from the level below. */
export function effectivePrefs(own: { space?: TypePrefs | null; base?: TypePrefs | null }): Record<NotificationType, Channels> {
  return Object.fromEntries(TYPES.map((t) => [t.id, channelsFor(t.id, own)])) as Record<NotificationType, Channels>;
}

/** The hour (0–23) and date in a time zone, for the 9 AM digest (NT-04). */
export function localClock(now: Date, timeZone: string): { hour: number; date: string } {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  } catch {
    zone = "Asia/Kolkata";
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

export const DIGEST_HOUR = 9;

/** "5 minutes ago", "3 hours ago", "2 days ago". */
export function ago(then: Date, now: number): string {
  const minutes = Math.max(0, Math.round((now - then.getTime()) / 60000));
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (minutes < 60) return f.format(-minutes, "minute");
  if (minutes < 2880) return f.format(-Math.round(minutes / 60), "hour");
  return f.format(-Math.round(minutes / 1440), "day");
}

/** Today, Yesterday or a date, for grouping the list. */
export function dayLabel(then: Date, now: number, timeZone: string): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const today = day(new Date(now));
  const yesterday = day(new Date(now - 864e5));
  const d = day(then);
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(then);
}
