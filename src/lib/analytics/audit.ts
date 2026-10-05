// First audit (OB-08): what is working, what is not, three recommendations with
// evidence, and a draft two-week calendar. Every number here is computed from
// the imported posts; nothing is estimated (AI-07). When the AI Copilot lands it
// rewords these findings but never changes the numbers.
import type { PlacementKind, Platform } from "@/lib/placements";
import { WEEKDAY_NAMES, addDays, isoDate, zonedParts, zonedToUtc } from "./time";

export type Format = "reel" | "carousel" | "post" | "story";

export interface PostFact {
  id: string;
  title: string;
  format: Format;
  pillar: string | null;
  platform: Platform;
  publishedAt: Date;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export interface Evidence {
  metric: string;
  values: Record<string, number | string>;
  sampleSize: number;
  postIds: string[];
}

export interface Finding {
  key: string;
  kind: "working" | "not_working";
  head: string;
  text: string;
  sample: string;
  evidence: Evidence;
}

export interface Recommendation {
  key: string;
  title: string;
  rationale: string;
  sample: string;
  evidence: Evidence;
}

export interface DraftPost {
  key: string;
  date: string;
  weekday: number;
  time: string;
  scheduledAt: string;
  format: Format;
  placements: PlacementKind[];
  pillar: string;
  title: string;
}

export interface Audit {
  enough: boolean;
  postCount: number;
  periodDays: number;
  totals: { followers: number; reach: number; views: number; engagement: number; engagementRate: number };
  findings: Finding[];
  recommendations: Recommendation[];
  plan: DraftPost[];
}

/** Comparisons need at least this many posts per group (PRD 6.13 edge cases). */
export const MIN_GROUP = 5;
export const MIN_POSTS_FOR_AUDIT = 5;

const FORMAT_NAME: Record<Format, string> = { reel: "Reel", carousel: "Carousel", post: "Post", story: "Story" };

export const engagement = (p: PostFact) => p.likes + p.comments + p.saves + p.shares;
/** Engagement ÷ reach for one post (PRD metric definitions). */
export const postEngagementRate = (p: PostFact) => (p.reach > 0 ? engagement(p) / p.reach : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function groupBy<T>(xs: T[], key: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (k == null) continue;
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

export type Slot = "morning" | "afternoon" | "evening" | "night";
export const SLOTS: Record<Slot, { label: string; from: number; to: number; postAt: string }> = {
  morning: { label: "mornings (7 AM–12 PM)", from: 7, to: 12, postAt: "10:00" },
  afternoon: { label: "afternoons (12–5 PM)", from: 12, to: 17, postAt: "13:00" },
  evening: { label: "evenings (5–9 PM)", from: 17, to: 21, postAt: "19:00" },
  night: { label: "nights (9 PM–7 AM)", from: 21, to: 7, postAt: "21:00" },
};

export function slotOf(hour: number): Slot {
  if (hour >= 7 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

interface Analysis {
  topFormat?: { format: Format; reachShare: number; postShare: number; perWeek: number; posts: PostFact[] };
  pillars?: { best: string; worst: string; middle?: string; ratio: number; bestPosts: PostFact[]; worstPosts: PostFact[] };
  time?: { slot: Slot; er: number; otherEr: number; days: number[]; posts: PostFact[] };
  formatRanking: Format[];
}

function analyse(posts: PostFact[], periodDays: number, timeZone: string): Analysis {
  const totalReach = posts.reduce((a, p) => a + p.reach, 0);
  const byFormat = groupBy(posts, (p) => p.format);
  const formatRanking = [...byFormat.entries()]
    .map(([f, ps]) => ({ f: f as Format, reach: ps.reduce((a, p) => a + p.reach, 0) }))
    .sort((a, b) => b.reach - a.reach)
    .map((x) => x.f);

  const out: Analysis = { formatRanking };

  const top = formatRanking[0];
  if (top && totalReach > 0) {
    const ps = byFormat.get(top)!;
    const reachShare = ps.reduce((a, p) => a + p.reach, 0) / totalReach;
    const postShare = ps.length / posts.length;
    if (ps.length >= 3 && reachShare - postShare >= 0.15) {
      out.topFormat = { format: top, reachShare, postShare, perWeek: (ps.length / periodDays) * 7, posts: ps };
    }
  }

  const pillarGroups = [...groupBy(posts, (p) => p.pillar).entries()]
    .filter(([, ps]) => ps.length >= MIN_GROUP)
    .map(([pillar, ps]) => ({ pillar, ps, er: avg(ps.map(postEngagementRate)) }))
    .sort((a, b) => b.er - a.er);
  if (pillarGroups.length >= 2) {
    const best = pillarGroups[0];
    const worst = pillarGroups[pillarGroups.length - 1];
    const ratio = worst.er > 0 ? best.er / worst.er : 0;
    if (ratio >= 1.5) {
      out.pillars = {
        best: best.pillar,
        worst: worst.pillar,
        middle: pillarGroups.length > 2 ? pillarGroups[1].pillar : undefined,
        ratio,
        bestPosts: best.ps,
        worstPosts: worst.ps,
      };
    }
  }

  const withLocal = posts.map((p) => ({ p, local: zonedParts(p.publishedAt, timeZone) }));
  const slots = [...groupBy(withLocal, (x) => slotOf(x.local.hour)).entries()]
    .filter(([, xs]) => xs.length >= MIN_GROUP)
    .map(([slot, xs]) => ({ slot: slot as Slot, xs, er: avg(xs.map((x) => postEngagementRate(x.p))) }))
    .sort((a, b) => b.er - a.er);
  // Best time slot against all other posts combined, each side with enough posts.
  const best = slots[0];
  const others = best ? withLocal.filter((x) => slotOf(x.local.hour) !== best.slot) : [];
  if (best && others.length >= MIN_GROUP) {
    const otherEr = avg(others.map((x) => postEngagementRate(x.p)));
    if (otherEr > 0 && best.er / otherEr >= 1.2) {
      const days = [...groupBy(best.xs, (x) => String(x.local.weekday)).entries()]
        .filter(([, xs]) => xs.length >= 2)
        .map(([d, xs]) => ({ d: Number(d), er: avg(xs.map((x) => postEngagementRate(x.p))) }))
        .sort((a, b) => b.er - a.er)
        .slice(0, 2)
        .map((x) => x.d)
        .sort((a, b) => a - b);
      out.time = { slot: best.slot, er: best.er, otherEr, days, posts: best.xs.map((x) => x.p) };
    }
  }
  return out;
}

const ideaBank: Record<string, string[]> = {
  education: ["Myth vs fact", "How it’s made", "3 tips from our team", "Questions customers ask us"],
  "behind the scenes": ["A morning behind the counter", "Meet the team", "A day in the life of our team"],
  community: ["Customer stories", "Poll: this or that?", "Your photos, our favourites"],
  offer: ["This week’s offer", "Weekend special"],
  product: ["Product spotlight", "New this month"],
};

const FORMAT_PLACEMENT: Record<Format, PlacementKind> = {
  reel: "ig_reel",
  carousel: "ig_carousel",
  post: "ig_post",
  story: "ig_story",
};

function draftPlan(a: Analysis, posts: PostFact[], periodDays: number, opts: { now: Date; timeZone: string; platforms: Platform[] }): DraftPost[] {
  const currentPerWeek = (posts.length / periodDays) * 7;
  const perWeek = Math.min(5, Math.max(3, Math.round(currentPerWeek) + 2));

  const preferred = [2, 4, 1, 5, 0, 3, 6];
  const bestDays = a.time?.days ?? [];
  const dayOrder = [...bestDays, ...preferred.filter((d) => !bestDays.includes(d))];
  const weekDays = dayOrder.slice(0, perWeek).sort((x, y) => x - y);
  const time = a.time ? SLOTS[a.time.slot].postAt : "18:00";
  const [hh, mm] = time.split(":").map(Number);

  const formats: Format[] = a.formatRanking.length ? a.formatRanking.filter((f) => f !== "story") : ["reel", "carousel", "post"];
  const formatCycle: Format[] = [formats[0], formats[1] ?? formats[0], formats[0], formats[2] ?? formats[0], formats[0]];

  const pillarsSeen = [...new Set(posts.map((p) => p.pillar).filter(Boolean) as string[])];
  const best = a.pillars?.best ?? pillarsSeen[0] ?? "education";
  const worst = a.pillars?.worst;
  const second = a.pillars?.middle ?? pillarsSeen.find((p) => p !== best && p !== worst) ?? best;

  const today = zonedParts(opts.now, opts.timeZone);
  const daysToMonday = 7 - today.weekday;
  const monday = addDays(today, daysToMonday);
  const used = new Map<string, number>();
  const plan: DraftPost[] = [];

  for (let week = 0; week < 2; week++) {
    weekDays.forEach((weekday, i) => {
      const date = addDays(monday, week * 7 + weekday);
      const last = i === weekDays.length - 1;
      const pillar = last && worst ? worst : i % 2 === 0 ? best : second;
      // Offers convert better as a single image post, shown on Facebook too.
      const format: Format = last && worst ? (formats.includes("post") ? "post" : formats[0]) : formatCycle[i % formatCycle.length];
      const placements: PlacementKind[] = [FORMAT_PLACEMENT[format]];
      if (opts.platforms.includes("facebook") && (format === "post" || format === "reel")) {
        placements.push(format === "post" ? "fb_post" : "fb_reel");
      }
      const ideas = ideaBank[pillar.toLowerCase()] ?? [`${cap(pillar)} post`];
      const n = used.get(pillar) ?? 0;
      used.set(pillar, n + 1);
      plan.push({
        key: `${isoDate(date)}-${i}`,
        date: isoDate(date),
        weekday: date.weekday,
        time,
        scheduledAt: zonedToUtc(date.year, date.month, date.day, hh, mm, opts.timeZone).toISOString(),
        format,
        placements: opts.platforms.includes("instagram") ? placements : placements.filter((p) => !p.startsWith("ig_")),
        pillar: cap(pillar),
        title: ideas[n % ideas.length],
      });
    });
  }
  return plan.filter((p) => p.placements.length > 0 || !opts.platforms.length);
}

export function computeAudit(
  posts: PostFact[],
  opts: { followers: number; periodDays: number; now: Date; timeZone: string; platforms: Platform[] },
): Audit {
  const totals = {
    followers: opts.followers,
    reach: posts.reduce((a, p) => a + p.reach, 0),
    views: posts.reduce((a, p) => a + p.views, 0),
    engagement: posts.reduce((a, p) => a + engagement(p), 0),
    engagementRate: avg(posts.map(postEngagementRate)),
  };
  const base = { postCount: posts.length, periodDays: opts.periodDays, totals };
  if (posts.length < MIN_POSTS_FOR_AUDIT) {
    return { ...base, enough: false, findings: [], recommendations: [], plan: [] };
  }

  const a = analyse(posts, opts.periodDays, opts.timeZone);
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  const ids = (ps: PostFact[]) => ps.map((p) => p.id);

  if (a.topFormat) {
    const { format, reachShare, postShare, perWeek, posts: ps } = a.topFormat;
    const name = FORMAT_NAME[format];
    findings.push({
      key: `format-reach-${format}`,
      kind: "working",
      head: `${name}s carry your reach.`,
      text: `${pct(reachShare)} of all reach came from ${name}s, though they were ${pct(postShare)} of your posts.`,
      sample: plural(posts.length, "post"),
      evidence: { metric: "reach share", values: { reachShare, postShare }, sampleSize: posts.length, postIds: ids(ps) },
    });
    const now = Math.max(1, Math.round(perWeek));
    const target = Math.min(7, now + 2);
    recommendations.push({
      key: `more-${format}`,
      title: `Move ${name}s from ${now} to ${target} a week`,
      rationale: `${name}s brought ${pct(reachShare)} of total reach. More of them is your fastest lever for growth.`,
      sample: plural(posts.length, "post"),
      evidence: { metric: "reach share", values: { reachShare, perWeek: Number(perWeek.toFixed(1)), target }, sampleSize: posts.length, postIds: ids(ps) },
    });
  }

  const topPost = [...posts].filter((p) => p.reach >= 100).sort((x, y) => postEngagementRate(y) - postEngagementRate(x))[0];
  if (topPost) {
    findings.push({
      key: `top-post-${topPost.id}`,
      kind: "working",
      head: `“${topPost.title}” was your best post.`,
      text: `It had a ${pct1(postEngagementRate(topPost))} engagement rate, against your average of ${pct1(totals.engagementRate)}.`,
      sample: "Top post by engagement rate",
      evidence: { metric: "engagement rate", values: { post: postEngagementRate(topPost), average: totals.engagementRate }, sampleSize: posts.length, postIds: [topPost.id] },
    });
  }

  if (a.pillars) {
    const { best, worst, ratio, bestPosts, worstPosts } = a.pillars;
    const sample = `${bestPosts.length} ${best} vs ${worstPosts.length} ${worst} posts`;
    const evidence = {
      metric: "engagement rate by pillar",
      values: { [best]: avg(bestPosts.map(postEngagementRate)), [worst]: avg(worstPosts.map(postEngagementRate)), ratio },
      sampleSize: bestPosts.length + worstPosts.length,
      postIds: ids([...bestPosts, ...worstPosts]),
    };
    findings.push({
      key: `pillar-lag-${worst}`,
      kind: "not_working",
      head: `${cap(worst)} posts lag.`,
      text:
        ratio >= 2
          ? `They got less than half the engagement rate of ${best} posts.`
          : `${cap(best)} posts got ${ratio.toFixed(1)}× their engagement rate.`,
      sample,
      evidence,
    });
    recommendations.push({
      key: `lead-with-${best}`,
      title: `Lead with ${best}, follow with ${worst}`,
      rationale: `${cap(best)} posts got ${ratio.toFixed(1)}× the engagement rate of ${worst} posts. Warm people up before you sell.`,
      sample,
      evidence,
    });
  }

  // Weeks counted back from now, so the newest week is complete.
  const weeks = Math.floor(opts.periodDays / 7);
  const weekCounts = Array.from({ length: weeks }, (_, w) => {
    const end = opts.now.getTime() - w * 7 * 864e5;
    return posts.filter((p) => p.publishedAt.getTime() <= end && p.publishedAt.getTime() > end - 7 * 864e5).length;
  });
  const thinWeeks = weekCounts.filter((c) => c < 2).length;
  if (thinWeeks >= 2) {
    findings.push({
      key: "uneven-posting",
      kind: "not_working",
      head: "Posting is uneven.",
      text: `${thinWeeks} of the last ${weeks} weeks had fewer than 2 posts. Steady posting keeps you in your followers’ feeds.`,
      sample: plural(weeks, "week"),
      evidence: { metric: "posts per week", values: { thinWeeks, weeks }, sampleSize: posts.length, postIds: [] },
    });
  }

  if (a.time) {
    const { slot, er, otherEr, days, posts: ps } = a.time;
    const label = SLOTS[slot].label;
    const dayText = days.length === 2 ? `${WEEKDAY_NAMES[days[0]]} and ${WEEKDAY_NAMES[days[1]]} ` : days.length === 1 ? `${WEEKDAY_NAMES[days[0]]} ` : "";
    recommendations.push({
      key: `post-${slot}`,
      title: `Post on ${dayText}${label.split(" (")[0]}`,
      rationale: `Posts in ${label} had a ${pct1(er)} engagement rate, ${(er / otherEr).toFixed(1)}× the rest of your posts.`,
      sample: plural(ps.length, `${slot} post`),
      evidence: { metric: "engagement rate by time", values: { slotEr: er, otherEr, days: days.join(",") }, sampleSize: ps.length, postIds: ids(ps) },
    });
  }

  return {
    ...base,
    enough: true,
    findings,
    recommendations: recommendations.slice(0, 3),
    plan: draftPlan(a, posts, opts.periodDays, opts),
  };
}
