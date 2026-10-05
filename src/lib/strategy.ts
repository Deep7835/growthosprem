// Strategy and content planner (PRD 6.16): the strategy document's shape, a summary of what
// the space has posted, a starter strategy built from that (used without AI, and as AI's
// starting point), and the 30-day planner (SG-03). Pure and tested.
import { z } from "zod";
import { addDays, isoDate, zonedParts, type LocalDate } from "@/lib/analytics/time";
import { SLOTS, engagement, slotOf, type PostFact, type Slot } from "@/lib/analytics/audit";
import type { Moment, Region } from "@/lib/festivals";
import { PLACEMENTS, type PlacementKind, type Platform } from "@/lib/placements";

export const OBJECTIVES = { awareness: "Awareness", leads: "Leads", sales: "Sales", community: "Community" } as const;
export type Objective = keyof typeof OBJECTIVES;
const PLATFORMS = ["instagram", "facebook", "linkedin"] as const;
const KINDS = Object.keys(PLACEMENTS) as [PlacementKind, ...PlacementKind[]];

/** SG-01: the wizard's inputs. */
export const StrategyInputs = z.object({
  business: z.string().max(600),
  industry: z.string().max(120),
  audience: z.string().max(800),
  location: z.string().max(200),
  offer: z.string().max(800),
  objective: z.enum(Object.keys(OBJECTIVES) as [Objective, ...Objective[]]),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(3),
  postsPerWeek: z.number().int().min(1).max(21),
  competitors: z.string().max(800),
  regions: z.array(z.enum(["north", "south", "east", "west"])).max(4),
});
export type StrategyInputs = z.infer<typeof StrategyInputs>;

/** SG-02: the strategy document. Kept free of numeric limits so AI can fill it; normalizeDoc() tidies it. */
export const StrategyDoc = z.object({
  positioning: z.string(),
  audience: z.string(),
  goals: z.array(z.object({ goal: z.string(), metric: z.string(), target: z.string(), by: z.string() })),
  pillars: z.array(z.object({ name: z.string(), share: z.number(), description: z.string(), examples: z.array(z.string()) })),
  cadence: z.array(z.object({ platform: z.enum(PLATFORMS), format: z.enum(KINDS), perWeek: z.number() })),
  themes: z.array(z.string()),
  tactics: z.object({ reach: z.array(z.string()), engagement: z.array(z.string()), community: z.array(z.string()), conversion: z.array(z.string()) }),
  plan: z.object({ days30: z.array(z.string()), days60: z.array(z.string()), days90: z.array(z.string()) }),
});
export type StrategyDoc = z.infer<typeof StrategyDoc>;

/** Whole-number shares that add up to 100 (largest remainder), each at least `min`. */
export function normalizeShares(weights: number[], min = 5): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = safe.reduce((a, b) => a + b, 0) || safe.length;
  const raw = safe.map((w) => (total === safe.length && safe.every((x) => x === 0) ? 100 / safe.length : (w / total) * 100));
  const floored = raw.map((r) => Math.max(min, Math.floor(r)));
  let diff = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; diff !== 0 && k < 1000; k++) {
    const [, i] = order[k % order.length];
    if (diff > 0) {
      floored[i]++;
      diff--;
    } else if (floored[i] > min) {
      floored[i]--;
      diff++;
    }
  }
  return floored;
}

/** Tidies a document from AI or an edit: trimmed text, shares summing to 100, sane cadence. */
export function normalizeDoc(doc: StrategyDoc): StrategyDoc {
  const list = (xs: string[], max = 12) => xs.map((x) => x.trim()).filter(Boolean).slice(0, max);
  const pillars = doc.pillars.filter((p) => p.name.trim()).slice(0, 7);
  const shares = normalizeShares(pillars.map((p) => p.share));
  return {
    positioning: doc.positioning.trim(),
    audience: doc.audience.trim(),
    goals: doc.goals.filter((g) => g.goal.trim()).slice(0, 6).map((g) => ({ goal: g.goal.trim(), metric: g.metric.trim(), target: g.target.trim(), by: g.by.trim() })),
    pillars: pillars.map((p, i) => ({ name: p.name.trim().slice(0, 40), share: shares[i], description: p.description.trim(), examples: list(p.examples, 6) })),
    cadence: doc.cadence
      .filter((c) => PLACEMENTS[c.format]?.platform === c.platform)
      .map((c) => ({ ...c, perWeek: Math.max(0, Math.min(14, Math.round(c.perWeek * 2) / 2)) }))
      .filter((c) => c.perWeek > 0)
      .slice(0, 12),
    themes: list(doc.themes),
    tactics: { reach: list(doc.tactics.reach, 6), engagement: list(doc.tactics.engagement, 6), community: list(doc.tactics.community, 6), conversion: list(doc.tactics.conversion, 6) },
    plan: { days30: list(doc.plan.days30, 8), days60: list(doc.plan.days60, 8), days90: list(doc.plan.days90, 8) },
  };
}

export interface History {
  posts: number;
  perWeek: number;
  followers: number;
  engagementRate: number;
  pillars: { name: string; posts: number; engagementRate: number }[];
  formats: { format: string; posts: number; avgReach: number }[];
  bestSlot: { slot: Slot; time: string } | null;
  /** 0 = Monday … 6 = Sunday, best first. */
  bestWeekdays: number[];
}

const rate = (list: PostFact[]) => {
  const reach = list.reduce((a, p) => a + p.reach, 0);
  return reach ? list.reduce((a, p) => a + engagement(p), 0) / reach : 0;
};

/** What the space has posted in the period: the facts the strategy and planner build on. */
export function summarizeHistory(facts: PostFact[], opts: { periodDays: number; timeZone: string; followers: number }): History {
  const group = <K extends string>(key: (p: PostFact) => K | null) => {
    const m = new Map<K, PostFact[]>();
    for (const p of facts) {
      const k = key(p);
      if (k) m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  };
  const byPillar = group((p) => (p.pillar?.trim() ? (p.pillar.trim().replace(/^\w/, (c) => c.toUpperCase()) as string) : null));
  const byFormat = group((p) => p.format);
  const bySlot = group((p) => slotOf(zonedParts(p.publishedAt, opts.timeZone).hour));
  const byDay = group((p) => String(zonedParts(p.publishedAt, opts.timeZone).weekday));
  const enough = (list: PostFact[]) => list.length >= 3;
  const slots = [...bySlot.entries()].filter(([, l]) => enough(l)).sort((a, b) => rate(b[1]) - rate(a[1]));
  return {
    posts: facts.length,
    perWeek: Math.round((facts.length / Math.max(1, opts.periodDays / 7)) * 10) / 10,
    followers: opts.followers,
    engagementRate: rate(facts),
    pillars: [...byPillar.entries()].map(([name, l]) => ({ name, posts: l.length, engagementRate: rate(l) })).sort((a, b) => b.posts - a.posts),
    formats: [...byFormat.entries()].map(([format, l]) => ({ format, posts: l.length, avgReach: Math.round(l.reduce((a, p) => a + p.reach, 0) / l.length) })).sort((a, b) => b.avgReach - a.avgReach),
    bestSlot: slots[0] ? { slot: slots[0][0], time: SLOTS[slots[0][0]].postAt } : null,
    bestWeekdays: [...byDay.entries()].filter(([, l]) => enough(l)).sort((a, b) => rate(b[1]) - rate(a[1])).map(([d]) => Number(d)),
  };
}

const DEFAULT_PILLARS: Record<Objective, [string, number, string][]> = {
  awareness: [
    ["Education", 35, "Useful tips and how-tos that people save and share."],
    ["Behind the scenes", 25, "The people, process and place behind the brand."],
    ["Community", 20, "Customers, reviews, questions and reposts."],
    ["Offers", 20, "Launches, combos and limited-time deals."],
  ],
  leads: [
    ["Education", 40, "Answers to the questions buyers ask before they enquire."],
    ["Proof", 25, "Results, testimonials and case stories."],
    ["Offers", 20, "Reasons to enquire now."],
    ["Behind the scenes", 15, "Who you are and how you work."],
  ],
  sales: [
    ["Product", 30, "What you sell, shown in use."],
    ["Offers", 30, "Deals, bundles and launches with a clear next step."],
    ["Proof", 20, "Reviews, UGC and before-and-afters."],
    ["Education", 20, "How to choose and use what you sell."],
  ],
  community: [
    ["Community", 35, "Customers, UGC, polls and questions."],
    ["Behind the scenes", 30, "The team and everyday moments."],
    ["Education", 20, "Helpful, shareable tips."],
    ["Offers", 15, "Thank-you deals for regulars."],
  ],
};

const TACTICS: Record<Objective, StrategyDoc["tactics"]> = {
  awareness: {
    reach: ["Lead with Reels: hook in the first second, text on screen", "Ride two festivals or trends a month", "Collaborate with one local creator a month"],
    engagement: ["End posts with a question", "Carousels that people save: lists and how-tos"],
    community: ["Repost customer stories every week", "Reply to every comment within a day"],
    conversion: ["Pin your best post and a clear bio link", "Story highlights for menu, prices and location"],
  },
  leads: {
    reach: ["Answer one common question per week in a Reel", "Share in local and niche groups"],
    engagement: ["“Comment INFO” prompts with a DM follow-up", "Polls in Stories about buyer doubts"],
    community: ["Feature clients’ results with their permission", "Go live once a month for Q&A"],
    conversion: ["One lead magnet (guide, free consult) linked in bio", "A clear CTA on every post: DM, call or form"],
  },
  sales: {
    reach: ["Product-in-use Reels with trending audio", "Festival and payday timing for offers"],
    engagement: ["Before-and-after and review carousels", "Story stickers: polls and countdowns for launches"],
    community: ["UGC with a branded hashtag", "Thank customers by name"],
    conversion: ["Offer posts with a deadline and a code to track sales", "Shoppable links and a short path to buy"],
  },
  community: {
    reach: ["Shareable relatable content about your customers’ lives", "Monthly collab with a neighbouring brand"],
    engagement: ["Weekly question or poll", "Reply in comments with personality"],
    community: ["Feature a regular every week", "Host a small offline meet-up and post it"],
    conversion: ["Members-only offers for followers", "Ask happy customers for reviews"],
  },
};

function cadenceFor(platforms: Platform[], perWeek: number, history: History | null): StrategyDoc["cadence"] {
  const reelsWin = !history?.formats.length || history.formats[0].format === "reel";
  const mix: [Platform, PlacementKind, number][] = [];
  if (platforms.includes("instagram")) mix.push(["instagram", "ig_reel", reelsWin ? 3 : 2], ["instagram", "ig_carousel", 2], ["instagram", "ig_post", 1]);
  if (platforms.includes("facebook")) mix.push(["facebook", "fb_post", 1.5], ["facebook", "fb_reel", 1]);
  if (platforms.includes("linkedin")) mix.push(["linkedin", "li_post", 2]);
  const weights = mix.map((m) => m[2]);
  const total = weights.reduce((a, b) => a + b, 0);
  const counts = mix.map((m) => (m[2] / total) * perWeek);
  const rounded = counts.map((c) => Math.round(c * 2) / 2);
  return mix.map(([platform, format], i) => ({ platform, format, perWeek: rounded[i] })).filter((c) => c.perWeek > 0);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * A starter strategy from the inputs and the space's own history, without AI. Pillars that
 * already work keep their place, weighted toward the ones with the best engagement.
 */
export function starterStrategy(inputs: StrategyInputs, history: History | null, moments: Moment[], brand: string): StrategyDoc {
  const used = (history?.pillars ?? []).filter((p) => p.posts >= 3).slice(0, 5);
  const avg = history?.engagementRate || 0;
  const pillars =
    used.length >= 2
      ? (() => {
          const shares = normalizeShares(used.map((p) => p.posts * Math.sqrt(avg ? Math.max(0.25, p.engagementRate / avg) : 1)));
          return used.map((p, i) => ({
            name: p.name,
            share: shares[i],
            description: `${p.posts} posts in the last 90 days at ${pct(p.engagementRate)} engagement.`,
            examples: [],
          }));
        })()
      : DEFAULT_PILLARS[inputs.objective].map(([name, share, description]) => ({ name, share, description, examples: [] as string[] }));

  const er = history?.engagementRate ?? 0;
  const goals: StrategyDoc["goals"] = [
    {
      goal: "Grow the audience",
      metric: "Followers",
      target: history?.followers ? `${Math.round(history.followers * 1.08).toLocaleString("en-IN")} (+8%)` : "+8% from today",
      by: "In 90 days",
    },
    { goal: "Get more people to interact", metric: "Engagement rate", target: er ? `${pct(er + 0.005)} (now ${pct(er)})` : "4% or higher", by: "In 60 days" },
    {
      goal: "Post consistently",
      metric: "Posts per week",
      target: `${inputs.postsPerWeek}${history?.perWeek !== undefined ? ` (now ${history.perWeek})` : ""}`,
      by: "Every week",
    },
  ];
  if (inputs.objective === "leads") goals.push({ goal: "Turn followers into enquiries", metric: "DMs and form leads", target: "30 a month", by: "In 90 days" });
  if (inputs.objective === "sales") goals.push({ goal: "Sell through social", metric: "Orders with a social code", target: "Track from week 1, then set a target", by: "In 30 days" });
  if (inputs.objective === "community") goals.push({ goal: "Build conversation", metric: "Comments per post", target: "+30%", by: "In 90 days" });

  const festivals = moments.slice(0, 6).map((m) => m.name);
  const top = pillars[0]?.name ?? "Education";
  return normalizeDoc({
    positioning: `${brand}${inputs.industry ? ` is a ${inputs.industry.toLowerCase()} brand` : ""}${inputs.location ? ` in ${inputs.location}` : ""}${inputs.offer ? ` offering ${inputs.offer.trim().replace(/\.$/, "")}` : ""}. On social, it should be the account ${inputs.audience ? "its audience" : "people"} follow for ${top.toLowerCase()} and a reason to visit or buy.`,
    audience: inputs.audience || "Describe who you want to reach: age, place, interests and what they need.",
    goals,
    pillars,
    cadence: cadenceFor(inputs.platforms, inputs.postsPerWeek, history),
    themes: [...festivals, ...pillars.slice(0, 2).map((p) => `${p.name} series`)],
    tactics: TACTICS[inputs.objective],
    plan: {
      days30: [
        `Post ${inputs.postsPerWeek} times a week following the pillar shares`,
        history?.bestSlot ? `Publish around ${SLOTS[history.bestSlot.slot].label}, your best time so far` : "Test mornings against evenings for two weeks",
        festivals[0] ? `Plan ${festivals[0]} content at least a week ahead` : "Plan the next festival a week ahead",
        "Fill Brand Brain and the Idea Bank so drafts start from what you know",
      ],
      days60: ["Double down on the two best-performing formats", "Start one recurring series people can expect", "Review the audit and drop what doesn’t work"],
      days90: ["Compare results with these goals and reset targets", "Turn the best posts into ads or collaborations", "Plan the next quarter’s festivals and launches"],
    },
  });
}

export interface PlanRow {
  id: string;
  date: string;
  time: string;
  platform: Platform;
  format: PlacementKind;
  pillar: string;
  topic: string;
  hook: string;
  cta: string;
  ideaId?: string;
  momentId?: string;
}

export const PlanRow = z.object({
  id: z.string().max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  platform: z.enum(PLATFORMS),
  format: z.enum(KINDS),
  pillar: z.string().max(60),
  topic: z.string().max(200),
  hook: z.string().max(300),
  cta: z.string().max(200),
  ideaId: z.string().optional(),
  momentId: z.string().optional(),
});

/** Spreads items by weight so they alternate (smooth weighted round-robin). */
export function interleave<T>(items: { item: T; weight: number }[], count: number): T[] {
  const live = items.filter((i) => i.weight > 0);
  if (!live.length) return [];
  const total = live.reduce((a, b) => a + b.weight, 0);
  const current = live.map(() => 0);
  const out: T[] = [];
  for (let n = 0; n < count; n++) {
    let best = 0;
    for (let i = 0; i < live.length; i++) {
      current[i] += live[i].weight;
      if (current[i] > current[best]) best = i;
    }
    current[best] -= total;
    out.push(live[best].item);
  }
  return out;
}

/** Topic starters by pillar, used when neither the Idea Bank nor the strategy has one. */
export function topicStarters(pillar: string, industry: string): string[] {
  const p = pillar.toLowerCase();
  const x = industry.trim().toLowerCase() || "what we do";
  const X = x.replace(/^\w/, (c) => c.toUpperCase());
  if (p.includes("educat") || p.includes("tip")) return [`${X} myths we hear all the time`, `A beginner’s guide to ${x}`, `${X} tip of the week`, `One thing we wish everyone knew about ${x}`];
  if (p.includes("behind")) return ["A day in the life of our team", "What happens before we open", "Meet the person behind the counter", "How a bestseller is made"];
  if (p.includes("offer") || p.includes("product")) return ["This week’s special", "Bundle of the month", "Something new is here", "Last chance: weekend deal"];
  if (p.includes("proof") || p.includes("review")) return ["What customers say this month", "Before and after", "Review of the week", "Why regulars keep coming back"];
  if (p.includes("community")) return ["Customer of the week", "Your questions, answered", "Poll: which one is your favourite?", "Tag a friend who needs this"];
  return [`${pillar}: tip of the week`, `${pillar}: story of the week`];
}

const CTA: Record<Objective, string> = {
  awareness: "Follow for more",
  leads: "DM us “INFO” to know more",
  sales: "Order now: link in bio",
  community: "Tell us in the comments",
};

function hookFor(pillar: string, topic: string) {
  const p = pillar.toLowerCase();
  if (p.includes("educat") || p.includes("tip")) return `Save this for later: ${topic}`;
  if (p.includes("behind")) return `Behind the scenes: ${topic}`;
  if (p.includes("offer") || p.includes("product")) return `${topic}, while it lasts`;
  if (p.includes("proof") || p.includes("review")) return `Don’t take our word for it: ${topic}`;
  if (p.includes("community")) return `This one’s for you: ${topic}`;
  return topic;
}

/**
 * SG-03 without AI: posts spread evenly over the next `days` days at the best time, formats and
 * pillars mixed by the strategy's cadence and shares, festivals placed on or just before
 * their day, and topics taken from the Idea Bank where a pillar matches.
 */
export function planDays(input: {
  start: LocalDate;
  days: number;
  doc: StrategyDoc;
  objective: Objective;
  history: History | null;
  moments: Moment[];
  ideas: { id: string; title: string; pillar: string | null }[];
  industry?: string;
}): PlanRow[] {
  const weekly = input.doc.cadence.reduce((a, c) => a + c.perWeek, 0) || 3;
  const total = Math.max(1, Math.round((weekly * input.days) / 7));
  const formats = interleave(input.doc.cadence.map((c) => ({ item: c, weight: c.perWeek })), total);
  const pillars = interleave(input.doc.pillars.map((p) => ({ item: p, weight: p.share })), total);
  const time = input.history?.bestSlot?.time ?? "19:00";
  const ideas = [...input.ideas];
  const examples = new Map(input.doc.pillars.map((p) => [p.name, [...p.examples]]));
  const starters = new Map(input.doc.pillars.map((p) => [p.name, topicStarters(p.name, input.industry ?? "")]));
  const used = new Map<string, number>();

  const rows: PlanRow[] = Array.from({ length: total }, (_, i) => {
    const day = isoDate(addDays(input.start, Math.floor((i * input.days) / total)));
    const cad = formats[i] ?? { platform: "instagram" as Platform, format: "ig_post" as PlacementKind };
    const pillar = pillars[i]?.name ?? "General";
    const ideaIndex = ideas.findIndex((x) => x.pillar?.trim().toLowerCase() === pillar.toLowerCase());
    const idea = ideaIndex >= 0 ? ideas.splice(ideaIndex, 1)[0] : undefined;
    const example = examples.get(pillar)?.shift();
    const n = used.get(pillar) ?? 0;
    const bank = starters.get(pillar) ?? topicStarters(pillar, input.industry ?? "");
    const starter = bank[n % bank.length];
    if (!idea && !example) used.set(pillar, n + 1);
    const topic = idea?.title ?? example ?? starter;
    return {
      id: `row-${i + 1}`,
      date: day,
      time,
      platform: cad.platform,
      format: cad.format,
      pillar,
      topic,
      hook: hookFor(pillar, topic),
      cta: CTA[input.objective],
      ...(idea ? { ideaId: idea.id } : {}),
    };
  });

  // Festivals and moments: take over the nearest post within 3 days before (or on) the day.
  const end = isoDate(addDays(input.start, input.days));
  const big = input.moments.filter((m) => m.date >= isoDate(input.start) && m.date < end && m.kind !== "day").slice(0, 6);
  for (const m of big) {
    const target = isoDate(addDays({ year: Number(m.date.slice(0, 4)), month: Number(m.date.slice(5, 7)), day: Number(m.date.slice(8)) }, -1));
    const candidates = rows.filter((r) => !r.momentId && r.date <= m.date && r.date >= isoDate(addDays({ year: Number(m.date.slice(0, 4)), month: Number(m.date.slice(5, 7)), day: Number(m.date.slice(8)) }, -3)));
    const topic = `${m.name}: ${m.idea ?? "festive post"}`;
    if (candidates.length) {
      const row = candidates.sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(target)) - Math.abs(Date.parse(b.date) - Date.parse(target)))[0];
      if (row.ideaId) ideas.unshift({ id: row.ideaId, title: row.topic, pillar: row.pillar });
      Object.assign(row, { topic, hook: `Countdown to ${m.name}`, momentId: m.id, ideaId: undefined });
      delete row.ideaId;
    } else {
      rows.push({
        id: `moment-${m.id}`,
        date: target < isoDate(input.start) ? m.date : target,
        time,
        platform: input.doc.cadence[0]?.platform ?? "instagram",
        format: input.doc.cadence[0]?.format ?? "ig_post",
        pillar: input.doc.pillars.find((p) => /offer|product/i.test(p.name))?.name ?? input.doc.pillars[0]?.name ?? "General",
        topic,
        hook: `Countdown to ${m.name}`,
        cta: CTA[input.objective],
        momentId: m.id,
      });
    }
  }
  return rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export type { Region };
