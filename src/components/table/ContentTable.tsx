"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { IssueList } from "@/components/content/Publishing";
import { Avatar, PlacementChip, PublishState, StatusDot, buttonClass } from "@/components/ui";
import { PLATFORM_NAMES, type Platform } from "@/lib/placements";
import type { Issue } from "@/lib/publishing/rules";
import type { BulkResult, CellResult } from "@/app/o/[org]/s/[space]/table/actions";
import type { TableView } from "@/db/schema";
import { matches, sortRows } from "@/lib/table";
import type { TableData, TableRow } from "@/server/table";

export const COLUMNS = [
  ["status", "Status"],
  ["platforms", "Platforms"],
  ["schedule", "Schedule"],
  ["assignees", "Assignees"],
  ["project", "Project"],
  ["tags", "Tags"],
  ["pillar", "Pillar"],
  ["publish", "Publishing"],
] as const;
type Column = (typeof COLUMNS)[number][0];

const SORTS = [
  ["updated_desc", "Last updated"],
  ["schedule_asc", "Schedule date, soonest first"],
  ["schedule_desc", "Schedule date, latest first"],
  ["created_desc", "Created, newest first"],
  ["title_asc", "Title, A to Z"],
] as const;

const PUBLISH = [
  ["not_scheduled", "Not scheduled"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
  ["partially_published", "Partly published"],
  ["failed", "Failed"],
] as const;

const DATES = [
  ["upcoming", "Upcoming"],
  ["week", "Next 7 days"],
  ["month", "Next 30 days"],
  ["past", "Past"],
  ["unscheduled", "No date"],
] as const;

type Filters = Record<string, string>;

type Edit = (id: string, change: { field: string; value: unknown }) => Promise<CellResult>;

interface Props {
  org: string;
  space: string;
  basePath: string;
  data: TableData;
  me: string;
  nowLocal: string;
  timeZoneLabel: string;
  canEdit: boolean;
  saved: TableView;
  edit: Edit;
  bulk: (ids: string[], action: Record<string, unknown>) => Promise<BulkResult>;
  saveView: (view: TableView) => Promise<void>;
}

export function ContentTable(props: Props) {
  const { data, canEdit } = props;
  const [rows, setRows] = useState(data.rows);
  const [filters, setFilters] = useState<Filters>(props.saved.filters ?? {});
  const [sort, setSort] = useState(props.saved.sort ?? "updated_desc");
  const [columns, setColumns] = useState<Column[]>(() => (props.saved.columns as Column[] | undefined)?.filter((c) => COLUMNS.some(([k]) => k === c)) ?? COLUMNS.map(([k]) => k));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<{ title: string; error?: string; issues?: Issue[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastClicked = useRef<string | null>(null);

  // Fresh rows from the server replace the optimistic ones.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(data.rows);
  }, [data.rows]);

  // VW-02: remember this view for this person (debounced).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => props.saveView({ filters: Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && k !== "q")), sort, columns }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, columns]);

  const visible = useMemo(() => sortRows(rows.filter((r) => matches(r, filters, { me: props.me, nowLocal: props.nowLocal })), sort), [rows, filters, sort, props.me, props.nowLocal]);
  const statusById = new Map(data.statuses.map((s) => [s.id, s]));
  const projectById = new Map(data.projects.map((p) => [p.id, p]));
  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const allTags = [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  const pillars = [...new Set(rows.map((r) => r.pillar).filter((p): p is string => Boolean(p)))].sort();
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== "q").length;
  const show = (c: Column) => columns.includes(c);
  const setFilter = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  async function save(row: TableRow, field: string, value: unknown, patch: Partial<TableRow>) {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)));
    setProblem(null);
    const result = await props.edit(row.id, { field, value });
    if (!result.ok) {
      setRows(before);
      setProblem({ title: row.title, error: result.error, issues: result.issues });
    }
  }

  function toggle(id: string, shift: boolean) {
    // Read the anchor now: the updater below runs after it has moved to this row.
    const anchor = lastClicked.current;
    setSelected((s) => {
      const next = new Set(s);
      if (shift && anchor) {
        const ids = visible.map((r) => r.id);
        const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) for (const x of ids.slice(a, b + 1)) next.add(x);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClicked.current = id;
  }

  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const openHref = (id: string) => `${props.basePath}?content=${id}`;

  return (
    <div className="flex flex-col gap-3 p-4 pb-28 md:p-6 md:pb-28">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-full max-w-[280px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input value={filters.q ?? ""} onChange={(e) => setFilter("q", e.target.value)} placeholder="Search titles and tags" aria-label="Search posts" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <span className="text-sm text-muted">
          {visible.length} of {rows.filter((r) => !r.archived || filters.archived === "1").length}
        </span>
        <span className="flex-1" />
        <Popover label={activeFilters ? `Filter · ${activeFilters}` : "Filter"}>
          <div className="grid w-[300px] grid-cols-2 gap-3 text-sm">
            <Choice label="Assignee" value={filters.assignee} onChange={(v) => setFilter("assignee", v)} options={[["me", "Assigned to me"], ["none", "Unassigned"], ...data.members.map((m) => [m.id, m.name] as [string, string])]} />
            <Choice label="Platform" value={filters.platform} onChange={(v) => setFilter("platform", v)} options={(Object.keys(PLATFORM_NAMES) as Platform[]).map((p) => [p, PLATFORM_NAMES[p]])} />
            <Choice label="Status" value={filters.status} onChange={(v) => setFilter("status", v)} options={data.statuses.map((s) => [s.id, s.name])} />
            <Choice label="Project" value={filters.project} onChange={(v) => setFilter("project", v)} options={[["none", "No project"], ...data.projects.map((p) => [p.id, p.name] as [string, string])]} />
            <Choice label="Tag" value={filters.tag} onChange={(v) => setFilter("tag", v)} options={allTags.map((t) => [t, t])} />
            <Choice label="Date" value={filters.date} onChange={(v) => setFilter("date", v)} options={DATES.map(([k, l]) => [k, l])} />
            <Choice label="Publishing" value={filters.publish} onChange={(v) => setFilter("publish", v)} options={PUBLISH.map(([k, l]) => [k, l])} />
            <label className="flex items-end gap-2 pb-2">
              <input type="checkbox" checked={filters.archived === "1"} onChange={(e) => setFilter("archived", e.target.checked ? "1" : "")} className="accent-ink" />
              Archived posts only
            </label>
            {activeFilters > 0 && (
              <button type="button" onClick={() => setFilters({ q: filters.q ?? "" })} className="col-span-2 justify-self-start text-xs font-semibold text-muted underline">
                Clear filters
              </button>
            )}
          </div>
        </Popover>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 font-semibold">
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Popover label="Columns">
          <div className="flex w-48 flex-col gap-1.5 text-sm">
            {COLUMNS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={show(k)} onChange={(e) => setColumns((c) => (e.target.checked ? COLUMNS.map(([x]) => x).filter((x) => x === k || c.includes(x)) : c.filter((x) => x !== k)))} className="accent-ink" />
                {l}
              </label>
            ))}
          </div>
        </Popover>
      </div>

      {problem && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
          <span className="flex flex-wrap items-center gap-2">
            <strong>Couldn’t change “{problem.title}”.</strong> {problem.error ?? "It isn’t ready to publish at that time."}
            <button type="button" onClick={() => setProblem(null)} className={buttonClass("ghost", "sm")}>
              Dismiss
            </button>
          </span>
          {problem.issues?.length ? (
            <div className="text-ink">
              <IssueList issues={problem.issues} org={props.org} space={props.space} onFix={() => setProblem(null)} />
            </div>
          ) : null}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-subtle text-xs font-semibold uppercase tracking-wider text-muted">
            <tr>
              {canEdit && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))}
                    className="accent-ink"
                  />
                </th>
              )}
              <th className="px-3 py-3">Title</th>
              {COLUMNS.filter(([k]) => show(k)).map(([k, l]) => (
                <th key={k} className="px-3 py-3">
                  {k === "schedule" ? `${l} · ${props.timeZoneLabel}` : l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={20} className="px-4 py-14 text-center text-muted">
                  {rows.length === 0 ? "No posts yet. Create one from the Board." : "No posts match these filters."}
                </td>
              </tr>
            )}
            {visible.map((r, index) => {
              const status = statusById.get(r.statusId);
              // Pop-overs in the last rows open upward so the table's scroll area doesn't cut them off.
              const up = visible.length > 4 && index >= visible.length - 3;
              const locked = ["published", "publishing", "partially_published"].includes(r.publishState);
              return (
                <tr key={r.id} className={`border-t border-line-soft align-middle ${selected.has(r.id) ? "bg-data-bg/50" : "hover:bg-subtle/60"} ${r.archived ? "opacity-60" : ""}`}>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.title}`}
                        checked={selected.has(r.id)}
                        onChange={() => {}}
                        onClick={(e) => toggle(r.id, e.shiftKey)}
                        className="accent-ink"
                      />
                    </td>
                  )}
                  <td className="min-w-[240px] px-3 py-2">
                    <span className="flex items-center gap-2">
                      {r.coverId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/o/${props.org}/s/${props.space}/media/${r.coverId}?v=thumb`} alt="" className="size-8 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="size-8 shrink-0 rounded bg-line-soft" />
                      )}
                      <TextCell
                        value={r.title}
                        disabled={!canEdit}
                        label="Title"
                        display={
                          <Link href={openHref(r.id)} scroll={false} className="font-semibold hover:underline">
                            {r.title}
                          </Link>
                        }
                        onSave={(v) => save(r, "title", v, { title: v })}
                      />
                      {r.archived && <span className="rounded bg-line-soft px-1.5 text-[11px] font-semibold text-muted">Archived</span>}
                    </span>
                  </td>
                  {show("status") && (
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        {status && <StatusDot color={status.color} />}
                        <select
                          aria-label={`Status of ${r.title}`}
                          value={r.statusId}
                          disabled={!canEdit}
                          onChange={(e) => save(r, "status", e.target.value, { statusId: e.target.value })}
                          className="h-8 max-w-[160px] rounded-md border border-transparent bg-transparent pr-1 hover:border-line disabled:opacity-100"
                        >
                          {data.statuses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </span>
                    </td>
                  )}
                  {show("platforms") && (
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {r.kinds.length ? r.kinds.map((k) => <PlacementChip key={k} kind={k} />) : <span className="text-faint">—</span>}
                      </span>
                    </td>
                  )}
                  {show("schedule") && (
                    <td className="whitespace-nowrap px-3 py-2">
                      <ScheduleCell row={r} disabled={!canEdit || locked} onSave={(v) => save(r, "schedule", v, { scheduledLocal: v, scheduleText: v ? v.replace("T", " ") : null })} />
                    </td>
                  )}
                  {show("assignees") && (
                    <td className="px-3 py-2">
                      <AssigneeCell
                        up={up}
                        row={r}
                        members={data.members}
                        disabled={!canEdit}
                        onSave={(ids) => save(r, "assignees", ids, { assigneeIds: ids })}
                        render={(ids) =>
                          ids.length ? (
                            <span className="flex -space-x-1.5">
                              {ids.slice(0, 3).map((id) => (
                                <Avatar key={id} name={memberById.get(id)?.name ?? "?"} size={24} />
                              ))}
                              {ids.length > 3 && <span className="pl-2 text-xs text-muted">+{ids.length - 3}</span>}
                            </span>
                          ) : (
                            <span className="text-faint">Unassigned</span>
                          )
                        }
                      />
                    </td>
                  )}
                  {show("project") && (
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Project of ${r.title}`}
                        value={r.projectId ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => save(r, "project", e.target.value || null, { projectId: e.target.value || null })}
                        className={`h-8 max-w-[160px] rounded-md border border-transparent bg-transparent hover:border-line disabled:opacity-100 ${r.projectId ? "" : "text-faint"}`}
                      >
                        <option value="">No project</option>
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        {r.projectId && !projectById.has(r.projectId) && <option value={r.projectId}>Archived project</option>}
                      </select>
                    </td>
                  )}
                  {show("tags") && (
                    <td className="min-w-[180px] px-3 py-2">
                      <TagsCell tags={r.tags} suggestions={allTags} disabled={!canEdit} onSave={(tags) => save(r, "tags", tags, { tags })} />
                    </td>
                  )}
                  {show("pillar") && (
                    <td className="px-3 py-2">
                      <TextCell
                        value={r.pillar ?? ""}
                        disabled={!canEdit}
                        label="Pillar"
                        placeholder="Add pillar"
                        list="pillar-options"
                        display={r.pillar ? <span>{r.pillar}</span> : <span className="text-faint">—</span>}
                        onSave={(v) => save(r, "pillar", v || null, { pillar: v || null })}
                        allowEmpty
                      />
                    </td>
                  )}
                  {show("publish") && (
                    <td className="px-3 py-2">
                      <PublishState state={r.publishState} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="pillar-options">
          {pillars.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      {notice && (
        <p role="status" className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-3 underline">
            OK
          </button>
        </p>
      )}

      {canEdit && selected.size > 0 && (
        <BulkBar
          count={selected.size}
          data={data}
          tags={allTags}
          archivedView={filters.archived === "1"}
          clear={() => setSelected(new Set())}
          run={async (action, label) => {
            const ids = [...selected];
            const result = await props.bulk(ids, action);
            const titles = new Map(rows.map((r) => [r.id, r.title]));
            if (result.failed.length === 0) {
              setNotice(`${label} · ${result.done} post${result.done === 1 ? "" : "s"}`);
              setSelected(new Set());
            } else {
              setNotice(
                `${label} · ${result.done} done, ${result.failed.length} not. ${result.failed
                  .slice(0, 3)
                  .map((f) => `“${titles.get(f.id)}”: ${f.reason}`)
                  .join(" ")}`,
              );
              setSelected(new Set(result.failed.map((f) => f.id)));
            }
          }}
        />
      )}
    </div>
  );
}

function Popover({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className={`${buttonClass("secondary", "sm")} h-9 cursor-pointer list-none`}>{label}</summary>
      <div className="absolute right-0 z-30 mt-1.5 rounded-xl border border-line bg-surface p-3 shadow-xl">{children}</div>
    </details>
  );
}

function Choice({ label, value, onChange, options }: { label: string; value: string | undefined; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2">
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Click to edit; Enter saves, Escape cancels. */
function TextCell({
  value,
  display,
  onSave,
  disabled,
  label,
  placeholder,
  list,
  allowEmpty = false,
}: {
  value: string;
  display: ReactNode;
  onSave: (v: string) => void;
  disabled: boolean;
  label: string;
  placeholder?: string;
  list?: string;
  allowEmpty?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing || disabled) {
    return (
      <span className="group flex min-w-0 items-center gap-1">
        {display}
        {!disabled && (
          <button
            type="button"
            aria-label={`Edit ${label.toLowerCase()}`}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="rounded px-1 text-xs text-faint opacity-0 hover:bg-line-soft hover:text-ink focus:opacity-100 group-hover:opacity-100"
          >
            ✎
          </button>
        )}
      </span>
    );
  }
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v !== value && (v || allowEmpty)) onSave(v);
  };
  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      list={list}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          e.stopPropagation();
          setEditing(false);
        }
      }}
      className="h-8 w-full min-w-[120px] rounded-md border border-ink px-2"
    />
  );
}

function ScheduleCell({ row, disabled, onSave }: { row: TableRow; disabled: boolean; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.scheduledLocal ?? "");
  const mark = row.publishState === "scheduled" ? (row.autopost ? " ⏱" : " ⏰") : "";
  if (!editing || disabled) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(row.scheduledLocal ?? "");
          setEditing(true);
        }}
        title={row.publishState === "scheduled" ? (row.autopost ? "Scheduled to publish automatically" : "Scheduled with a reminder") : undefined}
        className={`rounded-md px-1.5 py-1 text-left hover:bg-line-soft disabled:hover:bg-transparent ${row.scheduleText ? "text-ink-2" : "text-faint"}`}
      >
        {row.scheduleText ?? "No date"}
        {mark}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input
        type="datetime-local"
        autoFocus
        aria-label="Date and time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setEditing(false);
          }
          if (e.key === "Enter" && draft) {
            setEditing(false);
            if (draft !== row.scheduledLocal) onSave(draft);
          }
        }}
        className="h-8 rounded-md border border-ink px-1.5"
      />
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          if (draft && draft !== row.scheduledLocal) onSave(draft);
        }}
        className={buttonClass("primary", "sm")}
      >
        Save
      </button>
      {row.scheduledLocal && (
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            onSave(null);
          }}
          className={buttonClass("ghost", "sm")}
          title={row.publishState === "scheduled" ? "Unschedule" : "Remove the date"}
        >
          Clear
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className={buttonClass("ghost", "sm")}>
        ✕
      </button>
    </span>
  );
}

function AssigneeCell({
  up,
  row,
  members,
  disabled,
  onSave,
  render,
}: {
  up: boolean;
  row: TableRow;
  members: { id: string; name: string }[];
  disabled: boolean;
  onSave: (ids: string[]) => void;
  render: (ids: string[]) => ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState(row.assigneeIds);
  if (disabled) return <>{render(row.assigneeIds)}</>;
  return (
    <details
      ref={ref}
      className="relative"
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        if (open) setDraft(row.assigneeIds);
        else if (draft.length !== row.assigneeIds.length || draft.some((d) => !row.assigneeIds.includes(d))) onSave(draft);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center rounded-md px-1 py-1 hover:bg-line-soft" aria-label={`Assignees of ${row.title}`}>
        {render(row.assigneeIds)}
      </summary>
      <div className={`absolute left-0 z-20 w-52 rounded-xl border border-line bg-surface p-2 shadow-xl ${up ? "bottom-full mb-1" : "mt-1"}`}>
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-subtle">
            <input type="checkbox" checked={draft.includes(m.id)} onChange={(e) => setDraft((d) => (e.target.checked ? [...d, m.id] : d.filter((x) => x !== m.id)))} className="accent-ink" />
            <Avatar name={m.name} size={20} />
            {m.name}
          </label>
        ))}
        <button type="button" onClick={() => ref.current && (ref.current.open = false)} className={`${buttonClass("primary", "sm")} mt-1 w-full`}>
          Done
        </button>
      </div>
    </details>
  );
}

function TagsCell({ tags, suggestions, disabled, onSave }: { tags: string[]; suggestions: string[]; disabled: boolean; onSave: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-0.5 rounded-full bg-line-soft px-2 py-0.5 text-xs">
          {t}
          {!disabled && (
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onSave(tags.filter((x) => x !== t))} className="text-faint hover:text-ink">
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled &&
        (adding ? (
          <input
            autoFocus
            value={draft}
            list="tag-options"
            aria-label="New tag"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim()) onSave([...tags, draft.trim()]);
              setDraft("");
              setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                e.stopPropagation();
                setDraft("");
                setAdding(false);
              }
            }}
            className="h-6 w-24 rounded-md border border-ink px-1.5 text-xs"
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted hover:border-ink-2 hover:text-ink">
            + Tag
          </button>
        ))}
      <datalist id="tag-options">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </span>
  );
}

function BulkBar({
  count,
  data,
  tags,
  archivedView,
  clear,
  run,
}: {
  count: number;
  data: TableData;
  tags: string[];
  archivedView: boolean;
  clear: () => void;
  run: (action: Record<string, unknown>, label: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [days, setDays] = useState("7");
  const [tag, setTag] = useState("");
  const confirmRef = useRef<HTMLDialogElement>(null);
  const go = (action: Record<string, unknown>, label: string) => start(() => run(action, label));
  const select = (label: string, options: [string, string][], onPick: (v: string) => void) => (
    <select
      aria-label={label}
      value=""
      disabled={pending}
      onChange={(e) => e.target.value && onPick(e.target.value)}
      className="h-8 rounded-lg border border-white/20 bg-ink-2 px-2 text-[13px] font-semibold text-white"
    >
      <option value="">{label}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div role="toolbar" aria-label="Bulk actions" className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-2xl">
      <strong className="mr-1">{count} selected</strong>
      {select("Change status", data.statuses.map((s) => [s.id, s.name]), (v) => go({ action: "status", statusId: v }, "Status changed"))}
      {select("Assign", data.members.map((m) => [m.id, m.name]), (v) => go({ action: "assign", userId: v }, "Assigned"))}
      {select("Move to project", [["none", "No project"], ...data.projects.map((p) => [p.id, p.name] as [string, string])], (v) =>
        go({ action: "project", projectId: v === "none" ? null : v }, "Project changed"),
      )}
      <span className="flex items-center gap-1">
        <label className="sr-only" htmlFor="bulk-days">
          Days to move
        </label>
        <input id="bulk-days" type="number" value={days} onChange={(e) => setDays(e.target.value)} className="h-8 w-14 rounded-lg border border-white/20 bg-ink-2 px-1.5 text-white" />
        <button type="button" disabled={pending || !Number(days)} onClick={() => go({ action: "shift", days: Number(days) }, `Moved ${Math.abs(Number(days))} day${Math.abs(Number(days)) === 1 ? "" : "s"} ${Number(days) < 0 ? "earlier" : "later"}`)} className="h-8 rounded-lg border border-white/20 px-2 font-semibold hover:bg-white/10">
          Reschedule by days
        </button>
      </span>
      <span className="flex items-center gap-1">
        <input value={tag} onChange={(e) => setTag(e.target.value)} list="bulk-tags" placeholder="Tag" aria-label="Tag to add" className="h-8 w-24 rounded-lg border border-white/20 bg-ink-2 px-2 text-white placeholder:text-white/50" />
        <datalist id="bulk-tags">
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          type="button"
          disabled={pending || !tag.trim()}
          onClick={() => {
            go({ action: "tag", tag: tag.trim() }, `Tagged “${tag.trim()}”`);
            setTag("");
          }}
          className="h-8 rounded-lg border border-white/20 px-2 font-semibold hover:bg-white/10"
        >
          Add tag
        </button>
      </span>
      {archivedView ? (
        <button type="button" disabled={pending} onClick={() => go({ action: "restore" }, "Restored")} className="h-8 rounded-lg border border-white/20 px-2 font-semibold hover:bg-white/10">
          Restore
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => go({ action: "archive" }, "Archived")} className="h-8 rounded-lg border border-white/20 px-2 font-semibold hover:bg-white/10">
          Archive
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => confirmRef.current?.showModal()} className="h-8 rounded-lg bg-danger px-2 font-semibold hover:opacity-90">
        Delete
      </button>
      <button type="button" onClick={clear} className="h-8 rounded-lg px-2 text-white/80 hover:text-white">
        {pending ? "Working…" : "Clear"}
      </button>

      <dialog ref={confirmRef} aria-labelledby="delete-title" className="m-auto w-[min(440px,92vw)] rounded-2xl bg-surface p-5 text-ink shadow-2xl backdrop:bg-ink/40">
        <h2 id="delete-title" className="font-display text-lg font-bold">
          Delete {count} post{count === 1 ? "" : "s"}?
        </h2>
        <p className="mt-2 text-sm text-ink-2">
          This removes {count === 1 ? "it" : "them"} with {count === 1 ? "its" : "their"} comments, tasks, approvals and platform settings. It can’t be undone. Posts already
          published stay in analytics. To keep them out of the way instead, use Archive.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => confirmRef.current?.close()} className={buttonClass("ghost")}>
            {count === 1 ? "Keep it" : "Keep them"}
          </button>
          <button
            type="button"
            onClick={() => {
              confirmRef.current?.close();
              go({ action: "delete" }, "Deleted");
            }}
            className={`${buttonClass("primary")} bg-danger hover:bg-danger`}
          >
            Delete {count} post{count === 1 ? "" : "s"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
