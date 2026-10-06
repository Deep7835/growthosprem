"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { menuItem, Popover } from "@/components/Popover";
import { toast } from "@/components/Toaster";
import { AvatarStack, PlatformLogo, buttonClass } from "@/components/ui";
import type { OverviewLayout } from "@/db/schema";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import type { Category, Dashboard as Data, DashItem } from "@/server/overview";

export interface DashSpace {
  id: string;
  slug: string;
  name: string;
  color: string;
  timezone: string;
}

type WidgetId = "setup" | "recent" | "bySpace" | "byStatus" | "upcoming" | "tasksByStatus" | "tasksByAssignee" | "assigned" | "overdue" | "waiting" | "publishing" | "spaces";

const WIDGETS: Record<WidgetId, { title: string; subtitle: (range: number) => string; icon: IconName; size: 1 | 2 }> = {
  setup: { title: "Setup checklist", subtitle: () => "A few steps to get going", icon: "check", size: 2 },
  recent: { title: "Recent activity", subtitle: () => "Recently updated posts and notes", icon: "sparkles", size: 2 },
  bySpace: { title: "Content by space", subtitle: () => "Posts per space", icon: "board", size: 1 },
  byStatus: { title: "Content by status", subtitle: () => "Posts by status category", icon: "clipboard", size: 1 },
  upcoming: { title: "Upcoming items", subtitle: (r) => `Posts and tasks in the next ${r} days`, icon: "calendar", size: 2 },
  tasksByStatus: { title: "Tasks by status", subtitle: () => "Tasks by status category", icon: "check", size: 1 },
  tasksByAssignee: { title: "Tasks by assignee", subtitle: () => "Open tasks per person", icon: "users", size: 1 },
  assigned: { title: "Assigned to me", subtitle: () => "Open posts and tasks assigned to you", icon: "userPlus", size: 2 },
  overdue: { title: "Overdue", subtitle: () => "Posts and tasks past their date that aren’t completed or closed", icon: "alert", size: 2 },
  waiting: { title: "Waiting for client approval", subtitle: () => "Posts in client review", icon: "link", size: 2 },
  publishing: { title: "Publishing overview", subtitle: () => "Where posts are in publishing", icon: "send", size: 2 },
  spaces: { title: "Space breakdown", subtitle: () => "Posts and tasks in each space", icon: "folder", size: 2 },
};
const DEFAULT_ORDER = Object.keys(WIDGETS) as WidgetId[];

const CATEGORY: Record<Category, { label: string; color: string }> = {
  not_started: { label: "Not started", color: "#8C8F96" },
  active: { label: "Active", color: "#3B82F6" },
  completed: { label: "Completed", color: "#1E9E62" },
  closed: { label: "Closed", color: "#17181C" },
};

function ago(iso: string, now: number) {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return f.format(-minutes, "minute");
  if (Math.abs(minutes) < 60 * 36) return f.format(-Math.round(minutes / 60), "hour");
  if (Math.abs(minutes) < 60 * 24 * 45) return f.format(-Math.round(minutes / 1440), "day");
  return f.format(-Math.round(minutes / 43200), "month");
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface py-2 pl-3 pr-2" style={{ borderLeft: `3px solid ${color}` }}>
      <span className="truncate text-xs text-muted">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="grid min-h-16 place-items-center rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">{children}</p>;
}

/** One post, task or note, as on Rella-style cards: space, people, date, status, platforms. */
function ItemCard({ item, space, org, foot }: { item: DashItem; space?: DashSpace; org: string; foot: string }) {
  const base = `/o/${org}/s/${space?.slug}`;
  const href = item.kind === "task" ? `${base}/board?view=tasks&task=${item.id}` : item.kind === "note" ? `${base}/notes?note=${item.id}` : `${base}/board?content=${item.id}`;
  const when = item.at
    ? new Intl.DateTimeFormat("en-IN", { timeZone: space?.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(item.at))
    : null;
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface p-2.5 text-sm hover:border-ink-2/40 hover:shadow-sm" style={item.status ? { borderLeft: `3px solid ${item.status.color}` } : undefined}>
      <span className="flex items-center gap-2">
        <Icon name={item.kind === "task" ? "check" : item.kind === "note" ? "clipboard" : "board"} size={14} className="text-muted" />
        <b className="min-w-0 flex-1 truncate">{item.title}</b>
        {space && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
            <span aria-hidden className="grid size-4 place-items-center rounded text-[9px] font-bold text-ink" style={{ background: space.color }}>
              {space.name[0]}
            </span>
            <span className="max-w-24 truncate">{space.name}</span>
          </span>
        )}
      </span>
      {item.excerpt ? (
        <span className="line-clamp-2 text-[13px] text-muted">{item.excerpt}</span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          {when && (
            <span className="flex items-center gap-1">
              <Icon name="calendar" size={13} className="text-muted" />
              {when}
            </span>
          )}
          {item.status && (
            <span className="rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: item.status.color }}>
              {item.status.name}
            </span>
          )}
          {item.people.length > 0 && <AvatarStack people={item.people} />}
        </span>
      )}
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          {item.platforms.map((k, i) => (
            <PlatformLogo key={i} platform={PLACEMENTS[k as PlacementKind].platform} size={14} />
          ))}
        </span>
        <span className="text-[11px] text-muted">{foot}</span>
      </span>
    </Link>
  );
}

export function Dashboard(props: {
  org: string;
  orgName: string;
  userName: string;
  spaces: DashSpace[];
  /** Spaces chosen in Filters (all when empty). */
  chosen: string[];
  rangeDays: number;
  now: number;
  data: Data;
  checklist: { label: string; done: boolean; href?: string }[];
  layout: OverviewLayout;
  saveLayout: (layout: OverviewLayout) => Promise<void>;
  quickCreate: (space: string, projectId: string | null, kind: string) => Promise<void>;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState(props.layout);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [over, setOver] = useState<WidgetId | null>(null);
  const [, start] = useTransition();
  const [createSpace, setCreateSpace] = useState(props.spaces[0]?.slug ?? "");
  const spaceById = new Map(props.spaces.map((s) => [s.id, s]));
  const { data, now, org } = props;

  const order = [...(layout.order ?? []).filter((id): id is WidgetId => id in WIDGETS), ...DEFAULT_ORDER.filter((id) => !(layout.order ?? []).includes(id))];
  const hidden = new Set(layout.hidden ?? []);
  const setupDone = props.checklist.every((c) => c.done);
  const shown = order.filter((id) => !hidden.has(id) && !(id === "setup" && setupDone));
  const sizeOf = (id: WidgetId) => layout.sizes?.[id] ?? WIDGETS[id].size;
  const customised = Boolean(layout.order?.length || layout.hidden?.length || Object.keys(layout.sizes ?? {}).length);

  const persist = (next: OverviewLayout) => {
    setLayout(next);
    start(async () => {
      try {
        await props.saveLayout(next);
      } catch {
        toast("error", "Couldn’t save your dashboard layout");
      }
    });
  };
  const move = (from: WidgetId, to: WidgetId) => {
    if (from === to) return;
    const next = order.filter((x) => x !== from);
    next.splice(next.indexOf(to), 0, from);
    persist({ ...layout, order: next });
  };
  const filterHref = (changes: { spaces?: string[]; range?: number }) => {
    const q = new URLSearchParams();
    const spaces = changes.spaces ?? props.chosen;
    const range = changes.range ?? props.rangeDays;
    if (spaces.length && spaces.length < props.spaces.length) q.set("spaces", spaces.join(","));
    if (range !== 14) q.set("range", String(range));
    const s = q.toString();
    return `/o/${org}/overview${s ? `?${s}` : ""}`;
  };
  const chosen = props.chosen.length ? props.chosen : props.spaces.map((s) => s.slug);

  const list = (items: DashItem[], empty: string, foot: (i: DashItem) => string) =>
    items.length === 0 ? (
      <Empty>{empty}</Empty>
    ) : (
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <ItemCard key={`${i.kind}:${i.id}`} item={i} space={spaceById.get(i.spaceId)} org={org} foot={foot(i)} />
        ))}
      </div>
    );
  const categoryTiles = (counts: Record<string, number>) => (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(CATEGORY) as Category[]).map((c) => (
        <Tile key={c} label={CATEGORY[c].label} value={counts[c] ?? 0} color={CATEGORY[c].color} />
      ))}
    </div>
  );

  const body: Record<WidgetId, () => ReactNode> = {
    setup: () => (
      <ul className="grid gap-2 sm:grid-cols-2">
        {props.checklist.map((c) => (
          <li key={c.label} className={`flex items-center gap-2 text-sm ${c.done ? "text-muted line-through" : ""}`}>
            <span className={`grid size-5 place-items-center rounded-full text-[11px] ${c.done ? "bg-success-bg text-success" : "border border-line"}`}>{c.done ? "✓" : ""}</span>
            {c.href && !c.done ? (
              <Link href={c.href} className="underline">
                {c.label}
              </Link>
            ) : (
              c.label
            )}
          </li>
        ))}
      </ul>
    ),
    recent: () => list(data.recent, "Nothing has changed lately.", (i) => `Updated ${ago(i.updatedAt, now)}`),
    bySpace: () =>
      props.spaces.length ? (
        <div className="grid grid-cols-2 gap-2">
          {props.spaces
            .filter((s) => chosen.includes(s.slug))
            .map((s) => (
              <Tile key={s.id} label={s.name} value={data.contentBySpace[s.id] ?? 0} color={s.color} />
            ))}
        </div>
      ) : (
        <Empty>No spaces.</Empty>
      ),
    byStatus: () => categoryTiles(data.contentByCategory),
    upcoming: () => list(data.upcoming, "Nothing to show!", (i) => (i.kind === "task" ? "Task due" : "Planned")),
    tasksByStatus: () => categoryTiles(data.tasksByCategory),
    tasksByAssignee: () => {
      const top = Math.max(1, ...data.tasksByAssignee.map((a) => a.open));
      return data.tasksByAssignee.length === 0 ? (
        <Empty>No open tasks.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.tasksByAssignee.slice(0, 6).map((a) => (
            <li key={a.name} className="grid grid-cols-[96px_1fr_28px] items-center gap-2 text-sm">
              <span className="truncate">{a.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-line-soft" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(a.open / top) * 100}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{a.open}</span>
            </li>
          ))}
        </ul>
      );
    },
    assigned: () => list(data.assigned, "Nothing assigned to you.", (i) => (i.at ? (Date.parse(i.at) < now ? `Due ${ago(i.at, now)}` : i.kind === "task" ? "Task" : "Post") : "No date")),
    overdue: () => list(data.overdue, "Nothing overdue.", (i) => `Due ${ago(i.at!, now)}`),
    waiting: () => list(data.waiting, "Nothing is waiting on a client.", (i) => `Updated ${ago(i.updatedAt, now)}`),
    publishing: () => (
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Not scheduled" value={data.publishing.not_scheduled} color="#8C8F96" />
        <Tile label="Scheduled" value={data.publishing.scheduled} color="#3B82F6" />
        <Tile label="Published" value={data.publishing.published} color="#1E9E62" />
        <Tile label="Failed" value={data.publishing.failed} color="#B42318" />
      </div>
    ),
    spaces: () => (
      <ul className="divide-y divide-line-soft">
        {data.spaceBreakdown.map((b) => {
          const s = spaceById.get(b.spaceId);
          if (!s) return null;
          return (
            <li key={b.spaceId}>
              <Link href={`/o/${org}/s/${s.slug}/board`} className="flex items-center gap-2.5 py-2 text-sm hover:text-ink">
                <span aria-hidden className="grid size-6 place-items-center rounded-md text-xs font-bold text-ink" style={{ background: s.color }}>
                  {s.name[0]}
                </span>
                <span className="flex-1 truncate font-medium">{s.name}</span>
                <span className="text-muted">
                  {b.content} post{b.content === 1 ? "" : "s"} · {b.tasks} task{b.tasks === 1 ? "" : "s"}
                </span>
                <Icon name="chevronRight" size={15} className="text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    ),
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{props.orgName} overview</h1>
          <p className="text-sm text-muted">
            Good to see you, {props.userName}. What’s happening across {chosen.length === 1 ? "your space" : `${chosen.length} spaces`}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {customised && (
            <button type="button" onClick={() => persist({})} className={`${buttonClass("secondary", "sm")} gap-1.5`}>
              ↻ Reset
            </button>
          )}
          <Popover label="Choose cards" buttonClassName={`${buttonClass("secondary", "sm")} gap-1.5`} panelClassName="right-0 top-full mt-1 w-64" button={<><Icon name="board" size={15} /> Cards</>}>
            {() => (
              <div className="flex flex-col">
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Show on the dashboard</p>
                {DEFAULT_ORDER.map((id) => (
                  <label key={id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-subtle">
                    <input
                      type="checkbox"
                      checked={!hidden.has(id)}
                      onChange={(e) => persist({ ...layout, hidden: e.target.checked ? [...hidden].filter((x) => x !== id) : [...hidden, id] })}
                      className="accent-ink"
                    />
                    <Icon name={WIDGETS[id].icon} size={14} className="text-muted" />
                    {WIDGETS[id].title}
                  </label>
                ))}
              </div>
            )}
          </Popover>
          {props.canCreate && props.spaces.length > 0 && (
            <Popover label="Create" buttonClassName={`${buttonClass("primary", "sm")} gap-1.5`} panelClassName="right-0 top-full mt-1 w-60" button={<><Icon name="plus" size={15} /> Create</>}>
              {(close) => (
                <div className="flex flex-col">
                  <label className="px-2.5 pb-1.5 pt-1 text-xs text-muted">
                    In space
                    <select value={createSpace} onChange={(e) => setCreateSpace(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-1.5 text-sm text-ink">
                      {props.spaces.map((s) => (
                        <option key={s.id} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(
                    [
                      ["content", "Content", "board"],
                      ["task", "Task", "check"],
                      ["note", "Note", "clipboard"],
                    ] as const
                  ).map(([kind, label, icon]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        close();
                        start(() => props.quickCreate(createSpace, null, kind));
                      }}
                      className={menuItem}
                    >
                      <Icon name={icon} /> {label}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <Popover
          label="Filters"
          buttonClassName={`${buttonClass("secondary", "sm")} gap-1.5`}
          panelClassName="left-0 top-full mt-1 w-72"
          button={
            <>
              <Icon name="menu" size={15} /> Filters{chosen.length < props.spaces.length ? ` · ${chosen.length}` : ""}
            </>
          }
        >
          {() => (
            <div className="flex flex-col gap-1 p-1">
              <p className="px-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Spaces</p>
              <div className="flex flex-wrap gap-1.5 px-1 py-1">
                {props.spaces.map((s) => {
                  const on = chosen.includes(s.slug);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = on ? chosen.filter((x) => x !== s.slug) : [...chosen, s.slug];
                        if (next.length) router.push(filterHref({ spaces: next }));
                      }}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] ${on ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:bg-subtle"}`}
                    >
                      <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </button>
                  );
                })}
              </div>
              {chosen.length < props.spaces.length && (
                <Link href={filterHref({ spaces: [] })} className="px-1.5 text-xs font-semibold text-muted hover:text-ink">
                  Show all spaces
                </Link>
              )}
            </div>
          )}
        </Popover>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <Icon name="calendar" size={15} />
          <span className="sr-only">Date range</span>
          <select value={props.rangeDays} onChange={(e) => router.push(filterHref({ range: Number(e.target.value) }))} className="h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink">
            <option value={7}>Next and last 7 days</option>
            <option value={14}>Next and last 14 days</option>
            <option value={30}>Next and last 30 days</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-muted">Drag a card by its title to move it.</span>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        {shown.map((id) => {
          const w = WIDGETS[id];
          const wide = sizeOf(id) === 2;
          return (
            <section
              key={id}
              aria-label={w.title}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                if (over !== id) setOver(id);
              }}
              onDragLeave={() => setOver((o) => (o === id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(dragging, id);
                setDragging(null);
                setOver(null);
              }}
              className={`group/card flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-4 transition-shadow ${wide ? "md:col-span-2" : ""} ${over === id && dragging !== id ? "border-accent ring-2 ring-accent/40" : "border-line"} ${dragging === id ? "opacity-50" : ""}`}
            >
              <header
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                className="flex cursor-grab items-start gap-2 active:cursor-grabbing"
              >
                <span aria-hidden className="mt-0.5 w-0 overflow-hidden text-faint transition-all group-hover/card:w-3">⠿</span>
                <Icon name={w.icon} size={16} className="mt-0.5 text-muted" />
                <span className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold">{w.title}</h2>
                  <p className="text-xs text-muted">{w.subtitle(props.rangeDays)}</p>
                </span>
                <Popover label={`${w.title} options`} buttonClassName="grid size-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink aria-expanded:bg-subtle" panelClassName="right-0 top-full mt-1 w-48" button={<Icon name="more" size={17} />}>
                  {(close) => (
                    <div className="flex flex-col" onClick={close}>
                      <button type="button" onClick={() => persist({ ...layout, sizes: { ...layout.sizes, [id]: wide ? 1 : 2 } })} className={menuItem}>
                        <Icon name="panel" /> {wide ? "Make narrower" : "Make wider"}
                      </button>
                      {shown.indexOf(id) > 0 && (
                        <button type="button" onClick={() => move(id, shown[0])} className={menuItem}>
                          <Icon name="chevronDown" className="rotate-180" /> Move to top
                        </button>
                      )}
                      <button type="button" onClick={() => persist({ ...layout, hidden: [...hidden, id] })} className={menuItem}>
                        <Icon name="x" /> Hide card
                      </button>
                    </div>
                  )}
                </Popover>
              </header>
              <div className="max-h-[340px] min-h-0 overflow-y-auto">{body[id]()}</div>
            </section>
          );
        })}
      </div>
      {shown.length === 0 && <Empty>All cards are hidden. Choose some in Cards.</Empty>}
    </div>
  );
}
