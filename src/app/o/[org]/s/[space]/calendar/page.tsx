import { Calendar } from "@/components/calendar/Calendar";
import { PanelHost } from "@/components/content/PanelHost";
import { TaskPanelHost } from "@/components/tasks/TaskPanelHost";
import { loadCalendar, readFilters } from "@/server/calendar";
import { calendarSettings } from "@/server/calendar-page";
import { momentsForRange } from "@/server/strategy";
import { getSpaceContext } from "@/server/tenancy";
import { moveContent, moveTask, setCalendarPrefs } from "../../../calendar-actions";

export const metadata = { title: "Calendar" };

/** VW-04: the organisation calendar's behaviour, limited to one space. */
export default async function SpaceCalendarPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/calendar">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const timeZone = ctx.space.timezone;
  const s = calendarSettings(query, { timeZone, requestTime: ctx.requestTime, preferences: ctx.user.preferences });
  const filters = readFilters(query);
  const data = await loadCalendar({ orgId: ctx.org.id, userId: ctx.user.id }, [ctx.space], { view: s.view, anchor: s.anchor, weekStart: s.weekStart, timeZone, filters });
  const span = Math.round((Date.parse(data.range.to) - Date.parse(data.range.from)) / 864e5) + 1;
  const moments = await momentsForRange(ctx, data.range.from, span);
  const base = `/o/${org}/s/${space}/calendar`;
  const back = new URLSearchParams(s.query).toString();

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
        moveContent={moveContent.bind(null, org)}
        moveTask={moveTask.bind(null, org)}
        setPrefs={setCalendarPrefs.bind(null, org)}
      />
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof query.content === "string" ? query.content : null} closeHref={back ? `${base}?${back}` : base} />
      <TaskPanelHost ctx={ctx} org={org} space={space} taskId={typeof query.task === "string" ? query.task : null} closeHref={back ? `${base}?${back}` : base} />
    </>
  );
}
