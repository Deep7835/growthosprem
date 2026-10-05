// Table view filters and sort (VW-02). Pure, so they're tested and shared.
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";

export interface FilterableRow {
  id: string;
  title: string;
  statusId: string;
  projectId: string | null;
  scheduledAt: string | null;
  scheduledLocal: string | null;
  kinds: PlacementKind[];
  assigneeIds: string[];
  tags: string[];
  publishState: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export function cleanTags(tags: string[]) {
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, 40);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 20);
}

function addDaysLocal(local: string, days: number) {
  const d = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.toISOString().slice(0, 10)}${local.slice(10)}`;
}

export function matches(r: FilterableRow, f: Record<string, string>, ctx: { me: string; nowLocal: string }) {
  if (f.archived !== "1" && r.archived) return false;
  if (f.archived === "1" && !r.archived) return false;
  if (f.q && !r.title.toLowerCase().includes(f.q.toLowerCase()) && !r.tags.some((t) => t.toLowerCase().includes(f.q.toLowerCase()))) return false;
  if (f.assignee === "me" && !r.assigneeIds.includes(ctx.me)) return false;
  if (f.assignee === "none" && r.assigneeIds.length) return false;
  if (f.assignee && !["me", "none"].includes(f.assignee) && !r.assigneeIds.includes(f.assignee)) return false;
  if (f.platform && !r.kinds.some((k) => PLACEMENTS[k].platform === f.platform)) return false;
  if (f.tag && !r.tags.some((t) => t.toLowerCase() === f.tag.toLowerCase())) return false;
  if (f.project === "none" && r.projectId) return false;
  if (f.project && f.project !== "none" && r.projectId !== f.project) return false;
  if (f.status && r.statusId !== f.status) return false;
  if (f.publish && r.publishState !== f.publish) return false;
  if (f.date) {
    const s = r.scheduledLocal;
    if (f.date === "unscheduled") return !s;
    if (!s) return false;
    if (f.date === "past") return s < ctx.nowLocal;
    if (s < ctx.nowLocal) return false;
    if (f.date === "week") return s < addDaysLocal(ctx.nowLocal, 7);
    if (f.date === "month") return s < addDaysLocal(ctx.nowLocal, 30);
  }
  return true;
}

export function sortRows<T extends FilterableRow>(rows: T[], sort: string): T[] {
  const by = [...rows];
  const sched = (r: T, empty: string) => r.scheduledAt ?? empty;
  switch (sort) {
    case "schedule_asc":
      return by.sort((a, b) => sched(a, "9999").localeCompare(sched(b, "9999")));
    case "schedule_desc":
      return by.sort((a, b) => sched(b, "0000").localeCompare(sched(a, "0000")));
    case "created_desc":
      return by.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "title_asc":
      return by.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return by.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

