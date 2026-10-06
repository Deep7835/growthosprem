// Space analytics (PRD 6.13, AN-01 to AN-09). Pure and deterministic: every number on
// the page is computed here from stored posts, metrics and daily follower snapshots.
import type { Platform } from "@/lib/placements";
import { computeAudit, engagement, MIN_GROUP, postEngagementRate, slotOf, type PostFact, type Slot } from "./audit";
import { addDays, isoDate, zonedParts, zonedToUtc } from "./time";

export type RangeDays = 7 | 30 | 90;
export const RANGES: RangeDays[] = [7, 30, 90];
export const BREAKDOWN_DAYS = 90;

export interface ReportPost extends PostFact {
  accountId: string;
  /** The start of the caption and the link to the post on the platform, for Top content. */
  caption?: string;
  permalink?: string | null;
  /** AI tags (PRD 9). */
  topic?: string | null;
  hookType?: string | null;
}

export interface ReportAccount {
  id: string;
  platform: Platform;
  handle: string;
}

export interface Snapshot {
  accountId: string;
  day: string;
  followers: number;
}

export interface Kpi {
  value: number;
  previous: number | null;
}

export interface Group {
  name: string;
  posts: number;
  /** Null when the group has fewer than MIN_GROUP posts. */
  engagementRate: number | null;
}

export interface HeatCell {
  weekday: number;
  slot: Slot;
  posts: number;
  engagementRate: number | null;
}

export interface Report {
  range: { days: RangeDays; start: string; end: string; previousStart: string };
  canCompare: boolean;
  kpis: {
    engagement: Kpi;
    engagementRate: Kpi;
    views: Kpi;
    posts: Kpi;
    followers: { value: number; start: number | null };
    followerGrowth: number | null;
  };
  /** First day with follower data when it starts inside the range (newly connected account). */
  collectingSince: string | null;
  platforms: {
    accountId: string;
    platform: Platform;
    handle: string;
    followers: number;
    growth: number | null;
    views: number;
    posts: number;
    engagement: number;
    engagementRate: number;
  }[];
  contribution: Record<"engagement" | "views" | "followers", { platform: Platform; share: number; value: number }[]>;
  followerSeries: { day: string; followers: number }[];
  breakdowns: { byFormat: Group[]; byPillar: Group[]; byTopic: Group[]; byHook: Group[]; heatmap: HeatCell[]; posts: number; tagged: number };
  posts: (Omit<ReportPost, "publishedAt"> & { publishedAt: string; engagement: number; engagementRate: number })[];
  insights: {
    happened: string;
    why: { text: string; sample: string }[];
    next: { key: string; title: string; rationale: string; sample: string } | null;
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const pct = (x: number) => `${Math.abs(Math.round(x * 100))}%`;
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const FORMAT_NAMES: Record<string, string> = { reel: "Reels", carousel: "Carousels", post: "Posts", story: "Stories" };

function groups(posts: ReportPost[], key: (p: ReportPost) => string | null, label: (k: string) => string): Group[] {
  const map = new Map<string, ReportPost[]>();
  for (const p of posts) {
    const k = key(p);
    if (k) map.set(k, [...(map.get(k) ?? []), p]);
  }
  return [...map.entries()]
    .map(([k, ps]) => ({ name: label(k), posts: ps.length, engagementRate: ps.length >= MIN_GROUP ? avg(ps.map(postEngagementRate)) : null }))
    .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1) || b.posts - a.posts);
}

export function computeReport(input: {
  posts: ReportPost[];
  snapshots: Snapshot[];
  accounts: ReportAccount[];
  days: RangeDays;
  platform: Platform | "all";
  now: Date;
  timeZone: string;
}): Report {
  const { days, now, timeZone } = input;
  const today = zonedParts(now, timeZone);
  const dayStart = (n: number) => {
    const d = addDays(today, -n);
    return { iso: isoDate(d), at: zonedToUtc(d.year, d.month, d.day, 0, 0, timeZone) };
  };
  const start = dayStart(days);
  const previousStart = dayStart(days * 2);
  const breakdownStart = dayStart(BREAKDOWN_DAYS);
  const todayIso = isoDate(today);

  const accounts = input.platform === "all" ? input.accounts : input.accounts.filter((a) => a.platform === input.platform);
  const accountIds = new Set(accounts.map((a) => a.id));
  const mine = input.posts.filter((p) => accountIds.has(p.accountId));
  const between = (from: Date, to: Date) => mine.filter((p) => p.publishedAt >= from && p.publishedAt < to);
  const current = between(start.at, now);
  const previous = between(previousStart.at, start.at);

  // Comparison needs data that reaches back to the start of the previous period.
  const historyStart = [...input.snapshots.map((s) => s.day), ...input.posts.map((p) => isoDate(zonedParts(p.publishedAt, timeZone)))].sort()[0];
  const canCompare = Boolean(historyStart && historyStart <= previousStart.iso);

  const followersAt = (accountId: string, day: string) => {
    const snaps = input.snapshots.filter((s) => s.accountId === accountId && s.day <= day).sort((a, b) => b.day.localeCompare(a.day));
    return snaps[0]?.followers ?? null;
  };
  const firstSnapshot = (accountId: string) =>
    input.snapshots.filter((s) => s.accountId === accountId).map((s) => s.day).sort()[0] ?? null;

  const followersEnd = sum(accounts.map((a) => followersAt(a.id, todayIso) ?? 0));
  const startValues = accounts.map((a) => followersAt(a.id, start.iso));
  const followersStart = startValues.every((v) => v != null) ? sum(startValues as number[]) : null;
  const firsts = accounts.map((a) => firstSnapshot(a.id)).filter(Boolean) as string[];
  const latestFirst = firsts.sort().at(-1) ?? null;
  const collectingSince = latestFirst && latestFirst > start.iso ? latestFirst : null;

  const measure = (ps: ReportPost[]) => ({
    engagement: sum(ps.map(engagement)),
    engagementRate: avg(ps.map(postEngagementRate)),
    views: sum(ps.map((p) => p.views)),
    posts: ps.length,
  });
  const cur = measure(current);
  const prev = canCompare ? measure(previous) : null;

  const platforms = input.accounts.map((a) => {
    const ps = input.posts.filter((p) => p.accountId === a.id && p.publishedAt >= start.at && p.publishedAt < now);
    const m = measure(ps);
    const end = followersAt(a.id, todayIso) ?? 0;
    const begin = followersAt(a.id, start.iso);
    return { accountId: a.id, platform: a.platform, handle: a.handle, followers: end, growth: begin == null ? null : end - begin, ...m };
  });

  const share = (key: "engagement" | "views" | "followers") => {
    const total = sum(platforms.map((p) => p[key]));
    return platforms.map((p) => ({ platform: p.platform, value: p[key], share: total ? p[key] / total : 0 }));
  };

  const followerSeries: Report["followerSeries"] = [];
  for (let n = days; n >= 0; n--) {
    const day = isoDate(addDays(today, -n));
    const values = accounts.map((a) => followersAt(a.id, day));
    if (values.every((v) => v != null)) followerSeries.push({ day, followers: sum(values as number[]) });
  }

  const recent = mine.filter((p) => p.publishedAt >= breakdownStart.at && p.publishedAt < now);
  const heatmap: HeatCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (const slot of ["morning", "afternoon", "evening", "night"] as Slot[]) {
      const ps = recent.filter((p) => {
        const local = zonedParts(p.publishedAt, timeZone);
        return local.weekday === weekday && slotOf(local.hour) === slot;
      });
      heatmap.push({ weekday, slot, posts: ps.length, engagementRate: ps.length ? avg(ps.map(postEngagementRate)) : null });
    }
  }

  // What happened follows the filters; why and what next use the last 90 days so
  // groups have enough posts, the same as the first audit.
  const growth = followersStart == null ? null : followersEnd - followersStart;
  let happened =
    growth == null
      ? `${fmt(followersEnd)} followers. Growth shows once we have a full period of daily snapshots.`
      : `Followers ${growth >= 0 ? "grew" : "fell"} ${Math.abs((followersStart ? growth / followersStart : 0) * 100).toFixed(1)}%, from ${fmt(followersStart!)} to ${fmt(followersEnd)}.`;
  if (prev && prev.views > 0) {
    const change = (cur.views - prev.views) / prev.views;
    happened += ` Views were ${change >= 0 ? "up" : "down"} ${pct(change)} on the previous ${days} days.`;
  }
  const audit = computeAudit(recent, { followers: followersEnd, periodDays: BREAKDOWN_DAYS, now, timeZone, platforms: accounts.map((a) => a.platform) });
  const why = audit.findings
    .filter((f) => f.key.startsWith("format-reach") || f.key.startsWith("pillar-lag"))
    .map((f) => ({ text: `${f.head} ${f.text}`, sample: `${f.sample}, last 90 days` }));
  // "What next" always comes from all platforms, so "Add to plan" saves the same
  // recommendation the first audit shows.
  const allRecent = input.posts.filter((p) => p.publishedAt >= breakdownStart.at && p.publishedAt < now);
  const top =
    input.platform === "all"
      ? audit.recommendations[0]
      : computeAudit(allRecent, {
          followers: followersEnd,
          periodDays: BREAKDOWN_DAYS,
          now,
          timeZone,
          platforms: input.accounts.map((a) => a.platform),
        }).recommendations[0];

  return {
    range: { days, start: start.iso, end: todayIso, previousStart: previousStart.iso },
    canCompare,
    kpis: {
      engagement: { value: cur.engagement, previous: prev?.engagement ?? null },
      engagementRate: { value: cur.engagementRate, previous: prev && prev.posts ? prev.engagementRate : null },
      views: { value: cur.views, previous: prev?.views ?? null },
      posts: { value: cur.posts, previous: prev?.posts ?? null },
      followers: { value: followersEnd, start: followersStart },
      followerGrowth: growth,
    },
    collectingSince,
    platforms,
    contribution: { engagement: share("engagement"), views: share("views"), followers: share("followers") },
    followerSeries,
    breakdowns: {
      byFormat: groups(recent, (p) => p.format, (k) => FORMAT_NAMES[k] ?? k),
      byPillar: groups(recent, (p) => p.pillar, (k) => k.charAt(0).toUpperCase() + k.slice(1)),
      // Topics are many and small: the 8 most posted about, compared once they have enough posts.
      byTopic: groups(recent, (p) => p.topic ?? null, (k) => k.charAt(0).toUpperCase() + k.slice(1))
        .sort((a, b) => b.posts - a.posts)
        .slice(0, 8)
        .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1) || b.posts - a.posts),
      byHook: groups(recent, (p) => p.hookType ?? null, (k) => k),
      heatmap,
      posts: recent.length,
      tagged: recent.filter((p) => p.topic || p.hookType).length,
    },
    posts: current
      .map((p) => ({ ...p, publishedAt: p.publishedAt.toISOString(), engagement: engagement(p), engagementRate: postEngagementRate(p) }))
      .sort((a, b) => b.views - a.views),
    insights: {
      happened,
      why,
      next: top ? { key: top.key, title: top.title, rationale: top.rationale, sample: top.sample } : null,
    },
  };
}
