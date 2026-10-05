import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { withOrg } from "@/db";
import { mediaForContent } from "@/db/media";
import { contentAssignees, contentItems, placements, spaces, statuses, tasks, users } from "@/db/schema";
import { isoDate, zonedParts, zonedToUtc, addDays, type LocalDate } from "@/lib/analytics/time";
import { visibleDays, type CalendarView, type WeekStart } from "@/lib/calendar";
import { PLACEMENTS, type PlacementKind, type Platform } from "@/lib/placements";

type Space = typeof spaces.$inferSelect;

export interface CalendarFilters {
  type: "all" | "content" | "tasks";
  who: "anyone" | "me" | "unassigned" | string;
  state: "any" | "scheduled" | "unscheduled" | "published" | "failed";
  autopost: boolean;
  category: "any" | "not_started" | "active" | "completed" | "closed";
}

export const DEFAULT_FILTERS: CalendarFilters = { type: "all", who: "anyone", state: "any", autopost: false, category: "any" };

export function readFilters(q: Record<string, string | string[] | undefined>): CalendarFilters {
  const one = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);
  const who = one("who");
  return {
    type: pick(one("type"), ["all", "content", "tasks"] as const, "all"),
    who: who === "me" || who === "unassigned" || (who && /^[0-9a-f-]{36}$/.test(who)) ? who : "anyone",
    state: pick(one("state"), ["any", "scheduled", "unscheduled", "published", "failed"] as const, "any"),
    autopost: one("autopost") === "1",
    category: pick(one("cat"), ["any", "not_started", "active", "completed", "closed"] as const, "any"),
  };
}

export interface CalendarEvent {
  id: string;
  type: "content" | "task";
  title: string;
  space: { slug: string; name: string; color: string };
  /** Local date and minutes past midnight in the calendar's timezone; null when unscheduled. */
  date: string | null;
  minutes: number | null;
  status: { name: string; color: string; category: string } | null;
  publishState: string;
  autopost: boolean;
  kinds: PlacementKind[];
  platforms: Platform[];
  assignees: { id: string; name: string }[];
  coverId: string | null;
  caption: string;
  /** Content id a task belongs to, so clicking it opens that post. */
  contentId: string | null;
  done: boolean;
  /** Published or publishing posts can't move; tasks and everything else can. */
  movable: boolean;
}

/** One timezone for a calendar: the spaces' own when they agree, otherwise India time. */
export function calendarZone(list: Pick<Space, "timezone">[]) {
  const zones = new Set(list.map((s) => s.timezone));
  return zones.size === 1 ? [...zones][0] : "Asia/Kolkata";
}

const local = (at: Date, timeZone: string) => {
  const p = zonedParts(at, timeZone);
  return { date: isoDate(p), minutes: p.hour * 60 + p.minute };
};

/** Everything a calendar shows for these spaces in the visible range, plus unscheduled posts for the tray. */
export async function loadCalendar(
  ctx: { orgId: string; userId: string },
  spaceList: Space[],
  opts: { view: CalendarView; anchor: LocalDate; weekStart: WeekStart; timeZone: string; filters: CalendarFilters },
) {
  const days = visibleDays(opts.view, opts.anchor, opts.weekStart);
  const from = zonedToUtc(days[0].year, days[0].month, days[0].day, 0, 0, opts.timeZone);
  const last = addDays(days[days.length - 1], 1);
  const to = zonedToUtc(last.year, last.month, last.day, 0, 0, opts.timeZone);
  const ids = spaceList.map((s) => s.id);
  const bySpace = new Map(spaceList.map((s) => [s.id, s]));
  const f = opts.filters;
  if (ids.length === 0) return { events: [], unscheduled: [], members: [], range: { from: isoDate(days[0]), to: isoDate(days[days.length - 1]) } };

  return withOrg(ctx.orgId, async (tx) => {
    const wantContent = f.type !== "tasks";
    const wantTasks = f.type !== "content" && f.state === "any" && !f.autopost && f.category === "any";

    const [scheduled, unscheduledRows, taskRows] = await Promise.all([
      wantContent
        ? tx
            .select({ item: contentItems, status: statuses })
            .from(contentItems)
            .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
            .where(and(inArray(contentItems.spaceId, ids), gte(contentItems.scheduledAt, from), lt(contentItems.scheduledAt, to), isNull(contentItems.archivedAt)))
            .orderBy(asc(contentItems.scheduledAt))
        : [],
      wantContent
        ? tx
            .select({ item: contentItems, status: statuses })
            .from(contentItems)
            .innerJoin(statuses, eq(statuses.id, contentItems.statusId))
            .where(and(inArray(contentItems.spaceId, ids), isNull(contentItems.scheduledAt), isNull(contentItems.archivedAt)))
            .orderBy(asc(contentItems.position))
            .limit(50)
        : [],
      wantTasks
        ? tx
            .select()
            .from(tasks)
            .where(and(inArray(tasks.spaceId, ids), gte(tasks.dueAt, from), lt(tasks.dueAt, to)))
            .orderBy(asc(tasks.dueAt))
        : [],
    ]);

    const contentIds = [...scheduled, ...unscheduledRows].map((r) => r.item.id);
    const [pl, asg, media, people] = await Promise.all([
      contentIds.length ? tx.select({ contentItemId: placements.contentItemId, kind: placements.kind }).from(placements).where(inArray(placements.contentItemId, contentIds)) : [],
      contentIds.length
        ? tx
            .select({ contentItemId: contentAssignees.contentItemId, id: users.id, name: users.name })
            .from(contentAssignees)
            .innerJoin(users, eq(users.id, contentAssignees.userId))
            .where(inArray(contentAssignees.contentItemId, contentIds))
        : [],
      mediaForContent(tx, contentIds),
      taskRows.length
        ? tx
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, taskRows.map((t) => t.assigneeId).filter((x): x is string => Boolean(x))))
        : [],
    ]);

    const toEvent = ({ item, status }: (typeof scheduled)[number]): CalendarEvent => {
      const kinds = pl.filter((p) => p.contentItemId === item.id).map((p) => p.kind as PlacementKind);
      const space = bySpace.get(item.spaceId)!;
      const at = item.scheduledAt ? local(item.scheduledAt, opts.timeZone) : null;
      return {
        id: item.id,
        type: "content",
        title: item.title,
        space: { slug: space.slug, name: space.name, color: space.avatarColor },
        date: at?.date ?? null,
        minutes: at?.minutes ?? null,
        status: { name: status.name, color: status.color, category: status.category },
        publishState: item.publishState,
        autopost: item.autopost,
        kinds,
        platforms: [...new Set(kinds.map((k) => PLACEMENTS[k].platform))],
        assignees: asg.filter((a) => a.contentItemId === item.id).map(({ id, name }) => ({ id, name })),
        coverId: media.find((m) => m.contentId === item.id && m.asset.status === "ready" && m.asset.thumbKey)?.asset.id ?? null,
        caption: item.caption.slice(0, 160),
        contentId: item.id,
        done: false,
        movable: !["published", "publishing", "partially_published"].includes(item.publishState),
      };
    };

    const keep = (e: CalendarEvent) => {
      if (f.who === "me" && !e.assignees.some((a) => a.id === ctx.userId)) return false;
      if (f.who === "unassigned" && e.assignees.length) return false;
      if (f.who !== "anyone" && f.who !== "me" && f.who !== "unassigned" && !e.assignees.some((a) => a.id === f.who)) return false;
      if (e.type === "task") return true;
      if (f.autopost && !e.autopost) return false;
      if (f.category !== "any" && e.status?.category !== f.category) return false;
      if (f.state === "scheduled" && e.publishState !== "scheduled") return false;
      if (f.state === "unscheduled" && e.publishState !== "not_scheduled") return false;
      if (f.state === "published" && !["published", "partially_published"].includes(e.publishState)) return false;
      if (f.state === "failed" && !["failed", "partially_published"].includes(e.publishState)) return false;
      return true;
    };

    const taskEvents: CalendarEvent[] = taskRows.map((t) => {
      const space = bySpace.get(t.spaceId)!;
      const at = local(t.dueAt!, opts.timeZone);
      const who = people.find((p) => p.id === t.assigneeId);
      return {
        id: t.id,
        type: "task",
        title: t.title,
        space: { slug: space.slug, name: space.name, color: space.avatarColor },
        date: at.date,
        minutes: at.minutes,
        status: null,
        publishState: "not_scheduled",
        autopost: false,
        kinds: [],
        platforms: [],
        assignees: who ? [who] : [],
        coverId: null,
        caption: "",
        contentId: t.contentItemId,
        done: t.done,
        movable: !t.done,
      };
    });

    const events = [...scheduled.map(toEvent), ...taskEvents].filter(keep).sort((a, b) => (a.date! + String(a.minutes).padStart(4, "0")).localeCompare(b.date! + String(b.minutes).padStart(4, "0")));
    const members = new Map<string, string>();
    for (const e of events) for (const a of e.assignees) members.set(a.id, a.name);
    return {
      events,
      unscheduled: unscheduledRows.map(toEvent).filter(keep),
      members: [...members].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      range: { from: isoDate(days[0]), to: isoDate(days[days.length - 1]) },
    };
  });
}

export type CalendarData = Awaited<ReturnType<typeof loadCalendar>>;
