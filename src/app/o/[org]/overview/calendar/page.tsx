import { Calendar } from "@/components/calendar/Calendar";
import { EmptyState } from "@/components/ui";
import { calendarZone, loadCalendar, readFilters } from "@/server/calendar";
import { calendarSettings } from "@/server/calendar-page";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { moveContent, moveTask, setCalendarPrefs } from "../../calendar-actions";

export const metadata = { title: "Calendar" };

/** OV-04: every space the person can see, on one calendar. */
export default async function OrgCalendarPage({ params, searchParams }: PageProps<"/o/[org]/overview/calendar">) {
  const { org } = await params;
  const query = await searchParams;
  const [ctx, visible] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  if (visible.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No spaces yet" body="Ask an Admin to add you to a client space." />
      </div>
    );
  }
  const chosen = typeof query.spaces === "string" ? query.spaces.split(",") : null;
  const selected = chosen ? visible.filter((s) => chosen.includes(s.slug)) : visible;
  const timeZone = calendarZone(visible);
  const s = calendarSettings(query, { timeZone, requestTime: ctx.requestTime, preferences: ctx.user.preferences });
  const filters = readFilters(query);
  const data = await loadCalendar({ orgId: ctx.org.id, userId: ctx.user.id }, selected.length ? selected : visible, {
    view: s.view,
    anchor: s.anchor,
    weekStart: s.weekStart,
    timeZone,
    filters,
  });

  return (
    <Calendar
      scope="org"
      org={org}
      basePath={`/o/${org}/overview/calendar`}
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
      spaces={visible.map((v) => ({ slug: v.slug, name: v.name, color: v.avatarColor, selected: !chosen || chosen.includes(v.slug) }))}
      // Everyone edits content in the spaces they can see; each move is checked against that space.
      canMove
      moveContent={moveContent.bind(null, org)}
      moveTask={moveTask.bind(null, org)}
      setPrefs={setCalendarPrefs.bind(null, org)}
    />
  );
}
