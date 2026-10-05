// 90 days of sample post history for the Cafe space, used until real Instagram
// and Facebook import exists (OB-07). Deterministic, so the audit is stable.
import type { Format } from "@/lib/analytics/audit";
import { addDays, zonedParts, zonedToUtc } from "@/lib/analytics/time";

export interface DemoPost {
  externalId: string;
  platform: "instagram" | "facebook";
  format: Format;
  pillar: string;
  title: string;
  publishedAt: Date;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FORMATS: Format[] = [
  "reel", "carousel", "post", "reel", "reel", "post", "carousel", "reel", "post", "story", "reel", "carousel", "post",
  "reel", "reel", "carousel", "post", "reel", "story", "carousel", "post", "reel", "reel", "carousel", "post", "reel",
];
const BEHIND_THE_SCENES = new Set([4, 14, 22]);
const ON_FACEBOOK = new Set([5, 8, 12, 13, 16, 20, 21, 24]);
const POSTS_PER_WEEK = [2, 3, 1, 2, 3, 1, 2, 3, 2, 1, 2, 3, 1];
// Within a week: Wednesday evening, Friday evening, Saturday morning; single-post weeks use Tuesday lunch.
const WEEK_SLOTS = [
  { weekday: 2, hour: 19, minute: 0 },
  { weekday: 4, hour: 19, minute: 30 },
  { weekday: 5, hour: 10, minute: 0 },
];
const SINGLE_SLOT = { weekday: 1, hour: 13, minute: 0 };

const TITLES: Record<string, string[]> = {
  "education-reel": ["Latte art in 15 seconds", "How we grind our beans", "Cold brew, explained", "Espresso vs ristretto", "Milk frothing tips", "Pour-over at home", "Why we roast in small batches", "Reading a coffee label"],
  "education-carousel": ["5 coffee myths", "How we roast our beans", "Coffee strength guide", "Chai or coffee: the facts", "Storing beans the right way", "Brew ratios cheat sheet"],
  "behind the scenes-reel": ["Barista day in life", "A morning in the kitchen", "Meet our new baker"],
  "offer-post": ["Monsoon combo, 15% off", "Weekend brunch offer", "Buy 1 get 1 on cold brew", "Student discount Mondays", "Monsoon menu", "Happy hours are back", "Independence Day special"],
  "offer-story": ["Flash sale today", "Last day of the combo"],
};

const REACH: Record<Format, number> = { reel: 5200, carousel: 2300, post: 1100, story: 380 };
const RATE: Record<string, number> = { education: 0.08, "behind the scenes": 0.065, offer: 0.034 };

export function generateDemoHistory(now: Date, timeZone = "Asia/Kolkata") {
  const rand = mulberry32(42);
  const jitter = (spread: number) => 1 + (rand() * 2 - 1) * spread;
  const today = zonedParts(now, timeZone);
  // Week 0 starts 90 days ago; each week is a 7-day bucket, the newest ending yesterday.
  const start = addDays(today, -91);
  const used = new Map<string, number>();
  const posts: DemoPost[] = [];

  let i = 0;
  POSTS_PER_WEEK.forEach((count, week) => {
    const slots = count === 1 ? [SINGLE_SLOT] : WEEK_SLOTS.slice(0, count);
    for (const slot of slots) {
      // The day in this week's bucket that falls on the slot's weekday.
      const bucketStart = addDays(start, week * 7 + 1);
      const offset = (slot.weekday - bucketStart.weekday + 7) % 7;
      const day = addDays(bucketStart, offset);
      const format = FORMATS[i];
      const pillar = format === "post" || format === "story" ? "offer" : BEHIND_THE_SCENES.has(i) ? "behind the scenes" : "education";
      const titleKey = `${pillar}-${format}`;
      const n = used.get(titleKey) ?? 0;
      used.set(titleKey, n + 1);
      const platform = ON_FACEBOOK.has(i) ? "facebook" : "instagram";

      const reach = Math.round(REACH[format] * (platform === "facebook" ? 0.75 : 1) * jitter(0.2));
      const evening = slot.hour >= 17 && slot.hour < 21;
      const rate =
        RATE[pillar] * (evening ? 1.35 : 0.9) * (format === "carousel" ? 1.1 : format === "story" ? 0.6 : 1) * jitter(0.12);
      const total = Math.round(reach * rate);
      const likes = Math.round(total * 0.7);
      const comments = Math.round(total * 0.08);
      const saves = Math.round(total * 0.14);

      posts.push({
        externalId: `demo-${i + 1}`,
        platform,
        format,
        pillar,
        title: TITLES[titleKey][n % TITLES[titleKey].length],
        publishedAt: zonedToUtc(day.year, day.month, day.day, slot.hour, slot.minute, timeZone),
        reach,
        views: Math.round(reach * (format === "reel" ? 1.45 : 1.12)),
        likes,
        comments,
        saves,
        shares: Math.max(0, total - likes - comments - saves),
      });
      i++;
    }
  });

  // Daily follower snapshots, ending today: Instagram 9,050 → 9,820, Facebook 3,360 → 3,632.
  const followers = (from: number, to: number) =>
    Array.from({ length: 91 }, (_, d) => {
      const day = addDays(today, d - 90);
      const linear = from + ((to - from) * d) / 90;
      const wobble = d === 90 ? 0 : Math.round(Math.sin(d * 1.7) * 6);
      return { day: `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`, followers: Math.round(linear) + wobble };
    });

  return { posts, followers: { instagram: followers(9050, 9820), facebook: followers(3360, 3632) } };
}
