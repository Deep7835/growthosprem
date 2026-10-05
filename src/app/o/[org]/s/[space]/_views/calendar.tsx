import { Calendar } from "@/components/calendar/Calendar";
import { PanelHost } from "@/components/content/PanelHost";
import { TaskPanelHost } from "@/components/tasks/TaskPanelHost";
import { loadCalendar, readFilters } from "@/server/calendar";
import { calendarSettings } from "@/server/calendar-page";
import { momentsForRange } from "@/server/strategy";
import type { SpaceContext } from "@/server/tenancy";
import { moveContent, moveTask, setCalendarPrefs } from "../../../calendar-actions";
import { viewRoot, type Query } from "./root";

/** VW-04: the organisation calendar's behaviour, limited to one space or one project. */
export async function CalendarView({ ctx, query }: { ctx: SpaceContext; query: Query }) {
  const org = ctx.org.slug;
  const space = ctx.space.slug;
  const timeZone = ctx.space.timezone;
  const s = calendarSettings(query, { timeZone, requestTime: ctx.requestTime, preferences: ctx.user.preferences });
  const filters = readFilters(query);
  const data = await loadCalendar({ orgId: ctx.org.id, userId: ctx.user.id }, [ctx.space], {
    view: s.view,
    anchor: s.anchor,
    weekStart: s.weekStart,
    timeZone,
    filters,
    projectId: ctx.project?.id ?? null,
  });
  const span = Math.round((Date.parse(data.range.to) - Date.parse(data.range.from)) / 864e5) + 1;
  const moments = await momentsForRange(ctx, data.range.from, span);
  const base = `${viewRoot(ctx)}/calendar`;
  const back = new URLSearchParams(s.query).toString();
  const close = back ? `${base}?${back}` : base;

  return (
    <>
      <Calendar
        scope="space"
        org={org}
        basePath={base}
        query={s.query}
        view={s.view}
        date={s.date}
        today={s.today}
        nowMinutes={s.nowMinutes}
        weekStart={s.weekStart}
        colorBy={s.colorBy}
        timeZone={timeZone}
        data={data}
        filters={filters}
        canMove={ctx.can("content.edit")}
        moments={moments.map((m) => ({ date: m.date, name: m.name, approximate: m.approximate }))}
        platformColors={{ [ctx.space.slug]: ctx.space.platformColors }}
        moveContent={moveContent.bind(null, org)}
        moveTask={moveTask.bind(null, org)}
        setPrefs={setCalendarPrefs.bind(null, org)}
      />
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof query.content === "string" ? query.content : null} closeHref={close} />
      <TaskPanelHost ctx={ctx} org={org} space={space} taskId={typeof query.task === "string" ? query.task : null} closeHref={close} />
    </>
  );
}
