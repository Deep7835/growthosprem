import "server-only";
import { and, desc, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db";
import { contentItems, ideas, notes, placements, projects, tasks } from "@/db/schema";
import { PLACEMENTS, type PlacementKind, type Platform } from "@/lib/placements";
import { snippet } from "@/lib/search";
import type { OrgContext } from "./tenancy";

export type ResultType = "content" | "task" | "project" | "space" | "note" | "idea";

export interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  /** The matching text around the query, when it matched outside the title. */
  snippet: string | null;
  space: { name: string; color: string } | null;
  at: string | null;
  platforms: Platform[];
  href: string;
}

type VisibleSpace = { id: string; slug: string; name: string; avatarColor: string };

const LIMIT: Record<ResultType, number> = { content: 8, task: 5, project: 5, space: 5, note: 5, idea: 5 };

/**
 * SR-01, SR-02: content titles and captions, tasks, projects, spaces, notes and ideas across
 * every space the person can see, grouped by type. An empty query lists recent content.
 */
export async function searchOrg(ctx: OrgContext, orgSlug: string, visible: VisibleSpace[], query: string): Promise<SearchResult[]> {
  if (visible.length === 0) return [];
  const q = query.trim().slice(0, 100);
  const bySpace = new Map(visible.map((s) => [s.id, s]));
  const ids = visible.map((s) => s.id);
  const base = (spaceId: string) => `/o/${orgSlug}/s/${bySpace.get(spaceId)!.slug}`;
  const space = (spaceId: string) => {
    const s = bySpace.get(spaceId)!;
    return { name: s.name, color: s.avatarColor };
  };
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  // Title matches rank above body matches, then the most recently changed.
  const titleFirst = (col: Parameters<typeof ilike>[0]) => sql`case when ${col} ilike ${like} then 0 else 1 end`;

  return withOrg(ctx.org.id, async (tx) => {
    if (!q) {
      const recent = await tx
        .select({ id: contentItems.id, title: contentItems.title, spaceId: contentItems.spaceId, updatedAt: contentItems.updatedAt })
        .from(contentItems)
        .where(and(inArray(contentItems.spaceId, ids), isNull(contentItems.archivedAt)))
        .orderBy(desc(contentItems.updatedAt))
        .limit(6);
      const platforms = await platformsFor(tx, recent.map((r) => r.id));
      return [
        ...recent.map((r) => ({
          type: "content" as const,
          id: r.id,
          title: r.title,
          snippet: null,
          space: space(r.spaceId),
          at: r.updatedAt.toISOString(),
          platforms: platforms.get(r.id) ?? [],
          href: `${base(r.spaceId)}/board?content=${r.id}`,
        })),
        ...visible.slice(0, LIMIT.space).map((s) => ({ type: "space" as const, id: s.id, title: s.name, snippet: null, space: null, at: null, platforms: [], href: `${base(s.id)}/board` })),
      ];
    }

    const [content, taskRows, projectRows, noteRows, ideaRows] = await Promise.all([
      tx
        .select({ id: contentItems.id, title: contentItems.title, caption: contentItems.caption, hashtags: contentItems.hashtags, spaceId: contentItems.spaceId, updatedAt: contentItems.updatedAt })
        .from(contentItems)
        .where(
          and(
            inArray(contentItems.spaceId, ids),
            isNull(contentItems.archivedAt),
            or(ilike(contentItems.title, like), ilike(contentItems.caption, like), ilike(contentItems.hashtags, like)),
          ),
        )
        .orderBy(titleFirst(contentItems.title), desc(contentItems.updatedAt))
        .limit(LIMIT.content),
      tx
        .select({ id: tasks.id, title: tasks.title, spaceId: tasks.spaceId, contentItemId: tasks.contentItemId, dueAt: tasks.dueAt, createdAt: tasks.createdAt })
        .from(tasks)
        .where(and(inArray(tasks.spaceId, ids), ilike(tasks.title, like)))
        .orderBy(tasks.done, desc(tasks.createdAt))
        .limit(LIMIT.task),
      tx
        .select({ id: projects.id, name: projects.name, goal: projects.goal, spaceId: projects.spaceId, createdAt: projects.createdAt })
        .from(projects)
        .where(and(inArray(projects.spaceId, ids), isNull(projects.archivedAt), or(ilike(projects.name, like), ilike(projects.goal, like))))
        .orderBy(titleFirst(projects.name), desc(projects.createdAt))
        .limit(LIMIT.project),
      tx
        .select({ id: notes.id, title: notes.title, text: notes.text, spaceId: notes.spaceId, updatedAt: notes.updatedAt })
        .from(notes)
        .where(and(inArray(notes.spaceId, ids), or(ilike(notes.title, like), ilike(notes.text, like))))
        .orderBy(titleFirst(notes.title), desc(notes.updatedAt))
        .limit(LIMIT.note),
      tx
        .select({ id: ideas.id, title: ideas.title, notes: ideas.notes, spaceId: ideas.spaceId, createdAt: ideas.createdAt })
        .from(ideas)
        .where(and(inArray(ideas.spaceId, ids), or(ilike(ideas.title, like), ilike(ideas.notes, like))))
        .orderBy(titleFirst(ideas.title), desc(ideas.createdAt))
        .limit(LIMIT.idea),
    ]);
    const platforms = await platformsFor(tx, content.map((c) => c.id));
    const lower = q.toLowerCase();
    const spaceHits = visible.filter((s) => s.name.toLowerCase().includes(lower)).slice(0, LIMIT.space);
    const unless = (title: string, text: string) => (title.toLowerCase().includes(lower) ? null : snippet(text, q));

    return [
      ...content.map((c) => ({
        type: "content" as const,
        id: c.id,
        title: c.title,
        snippet: unless(c.title, `${c.caption}\n${c.hashtags}`),
        space: space(c.spaceId),
        at: c.updatedAt.toISOString(),
        platforms: platforms.get(c.id) ?? [],
        href: `${base(c.spaceId)}/board?content=${c.id}`,
      })),
      ...taskRows.map((t) => ({
        type: "task" as const,
        id: t.id,
        title: t.title,
        snippet: null,
        space: space(t.spaceId),
        at: (t.dueAt ?? t.createdAt).toISOString(),
        platforms: [],
        href: t.contentItemId ? `${base(t.spaceId)}/board?content=${t.contentItemId}` : `${base(t.spaceId)}/board`,
      })),
      ...projectRows.map((p) => ({
        type: "project" as const,
        id: p.id,
        title: p.name,
        snippet: unless(p.name, p.goal ?? ""),
        space: space(p.spaceId),
        at: p.createdAt.toISOString(),
        platforms: [],
        href: `${base(p.spaceId)}/table?project=${p.id}`,
      })),
      ...spaceHits.map((s) => ({ type: "space" as const, id: s.id, title: s.name, snippet: null, space: null, at: null, platforms: [], href: `${base(s.id)}/board` })),
      ...noteRows.map((n) => ({
        type: "note" as const,
        id: n.id,
        title: n.title || "Untitled note",
        snippet: unless(n.title, n.text),
        space: space(n.spaceId),
        at: n.updatedAt.toISOString(),
        platforms: [],
        href: `${base(n.spaceId)}/notes?note=${n.id}`,
      })),
      ...ideaRows.map((i) => ({
        type: "idea" as const,
        id: i.id,
        title: i.title,
        snippet: unless(i.title, i.notes),
        space: space(i.spaceId),
        at: i.createdAt.toISOString(),
        platforms: [],
        href: `${base(i.spaceId)}/ideas?idea=${i.id}`,
      })),
    ];
  });
}

async function platformsFor(tx: Tx, contentIds: string[]) {
  const map = new Map<string, Platform[]>();
  if (contentIds.length === 0) return map;
  const rows = await tx.select({ contentItemId: placements.contentItemId, kind: placements.kind }).from(placements).where(inArray(placements.contentItemId, contentIds));
  for (const r of rows) {
    const p = PLACEMENTS[r.kind as PlacementKind].platform;
    const list = map.get(r.contentItemId) ?? [];
    if (!list.includes(p)) list.push(p);
    map.set(r.contentItemId, list);
  }
  return map;
}
