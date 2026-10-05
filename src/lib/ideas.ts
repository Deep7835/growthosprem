// Idea Bank (VW-07): cleaning what people paste in, filtering, and grouping by pillar.

export const IDEA_SOURCES = { me: "Me", ai: "AI", trend: "Trend", competitor: "Competitor" } as const;
export type IdeaSource = keyof typeof IDEA_SOURCES;

/** Reference links: http(s) only, trimmed, no duplicates, at most 10. */
export function cleanLinks(input: { url: string; title?: string }[]) {
  const out: { url: string; title?: string }[] = [];
  for (const l of input) {
    let url = l.url.trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url) && /^[\w-]+(\.[\w-]+)+/.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (out.some((o) => o.url === parsed.toString())) continue;
      const title = l.title?.trim().slice(0, 120);
      out.push({ url: parsed.toString(), ...(title ? { title } : {}) });
    } catch {
      continue;
    }
  }
  return out.slice(0, 10);
}

/** "instagram.com" for a link chip. */
export function linkLabel(link: { url: string; title?: string }) {
  if (link.title) return link.title;
  try {
    return new URL(link.url).hostname.replace(/^www\./, "");
  } catch {
    return link.url;
  }
}

export interface IdeaLike {
  id: string;
  title: string;
  notes: string;
  source: IdeaSource;
  pillar: string | null;
  tags: string[];
  contentItemId: string | null;
  createdAt: string;
}

export function filterIdeas<T extends IdeaLike>(ideas: T[], f: { q?: string; source?: string; pillar?: string; tag?: string; used?: "hide" | "only" | "show" }) {
  return ideas.filter((i) => {
    if (f.used === "hide" && i.contentItemId) return false;
    if (f.used === "only" && !i.contentItemId) return false;
    if (f.source && i.source !== f.source) return false;
    if (f.pillar === "none" && i.pillar) return false;
    if (f.pillar && f.pillar !== "none" && (i.pillar ?? "").toLowerCase() !== f.pillar.toLowerCase()) return false;
    if (f.tag && !i.tags.some((t) => t.toLowerCase() === f.tag!.toLowerCase())) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (![i.title, i.notes, i.pillar ?? "", ...i.tags].some((s) => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

/** Columns for "Group by pillar": biggest pillar first, ideas without one last. Case-insensitive. */
export function groupByPillar<T extends IdeaLike>(ideas: T[]) {
  const groups = new Map<string, { pillar: string | null; ideas: T[] }>();
  for (const i of ideas) {
    const key = i.pillar?.trim().toLowerCase() || "";
    const g = groups.get(key) ?? { pillar: i.pillar?.trim() || null, ideas: [] };
    g.ideas.push(i);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.pillar === null ? 1 : b.pillar === null ? -1 : b.ideas.length - a.ideas.length || a.pillar.localeCompare(b.pillar)));
}

/** Distinct pillar names, keeping the most common spelling. */
export function pillarNames(values: (string | null)[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const v of values) {
    const name = v?.trim();
    if (!name) continue;
    const spellings = counts.get(name.toLowerCase()) ?? new Map();
    spellings.set(name, (spellings.get(name) ?? 0) + 1);
    counts.set(name.toLowerCase(), spellings);
  }
  return [...counts.values()]
    .map((s) => [...s.entries()].sort((a, b) => b[1] - a[1])[0][0])
    .sort((a, b) => a.localeCompare(b));
}
