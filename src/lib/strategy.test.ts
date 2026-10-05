import { describe, expect, it } from "vitest";
import type { PostFact } from "@/lib/analytics/audit";
import { momentsForYear, upcomingMoments } from "./festivals";
import { interleave, normalizeDoc, normalizeShares, planDays, starterStrategy, summarizeHistory, type StrategyInputs } from "./strategy";

const inputs: StrategyInputs = {
  business: "Neighbourhood cafe",
  industry: "Cafe",
  audience: "College students and young professionals in South Delhi",
  location: "Delhi",
  offer: "specialty coffee and all-day breakfast",
  objective: "awareness",
  platforms: ["instagram", "facebook"],
  postsPerWeek: 4,
  competitors: "",
  regions: ["north"],
};

const fact = (i: number, over: Partial<PostFact>): PostFact => ({
  id: `p${i}`,
  title: `Post ${i}`,
  format: "reel",
  pillar: null,
  platform: "instagram",
  publishedAt: new Date(Date.UTC(2026, 8, 1 + i, 13, 30)), // 7 PM IST
  reach: 1000,
  views: 1200,
  likes: 50,
  comments: 5,
  saves: 5,
  shares: 0,
  ...over,
});

describe("festival calendar", () => {
  it("has the 2026 dates from the government list and computes floating days", () => {
    const y = momentsForYear(2026);
    const date = (name: string) => y.find((m) => m.name === name)?.date;
    expect(date("Diwali")).toBe("2026-11-08");
    expect(date("Holi")).toBe("2026-03-04");
    expect(date("Raksha Bandhan")).toBe("2026-08-28");
    expect(date("Mother’s Day")).toBe("2026-05-10");
    expect(date("Friendship Day")).toBe("2026-08-02");
    expect(date("Black Friday")).toBe("2026-11-27");
    expect(y.find((m) => m.name === "Diwali")?.approximate).toBe(true);
    expect(y.find((m) => m.name === "Independence Day")?.approximate).toBeUndefined();
  });

  it("filters by region, always keeping All India and Global, and adds custom dates", () => {
    const south = upcomingMoments({ year: 2026, month: 8, day: 20 }, 15, { regions: ["south"] });
    expect(south.map((m) => m.name)).toEqual(expect.arrayContaining(["Onam", "Raksha Bandhan"]));
    const north = upcomingMoments({ year: 2026, month: 8, day: 20 }, 15, { regions: ["north"], custom: [{ id: "c1", name: "Cafe anniversary", date: "2026-08-30", region: "pan-india", kind: "custom" }] });
    expect(north.map((m) => m.name)).not.toContain("Onam");
    expect(north.map((m) => m.name)).toContain("Cafe anniversary");
  });

  it("rolls into the next year", () => {
    const m = upcomingMoments({ year: 2026, month: 12, day: 20 }, 30);
    expect(m.map((x) => x.name)).toEqual(expect.arrayContaining(["Christmas", "New Year’s Eve", "New Year’s Day", "Lohri"]));
  });
});

describe("strategy maths", () => {
  it("makes whole-number shares that add up to 100", () => {
    expect(normalizeShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(normalizeShares([90, 5, 5], 10).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.min(...normalizeShares([100, 1, 1], 10))).toBe(10);
    expect(normalizeShares([0, 0])).toEqual([50, 50]);
  });

  it("alternates weighted items instead of bunching them", () => {
    expect(interleave([{ item: "A", weight: 2 }, { item: "B", weight: 1 }], 6).join("")).toBe("ABAABA");
  });

  it("normalises a document: trims, caps, fixes shares, drops cadence on the wrong platform", () => {
    const doc = normalizeDoc({
      positioning: "  x ",
      audience: "y",
      goals: [{ goal: " ", metric: "", target: "", by: "" }],
      pillars: [
        { name: "A", share: 70, description: "", examples: [" e1 ", ""] },
        { name: "B", share: 70, description: "", examples: [] },
      ],
      cadence: [
        { platform: "facebook", format: "ig_reel", perWeek: 2 },
        { platform: "instagram", format: "ig_reel", perWeek: 2.3 },
      ],
      themes: [],
      tactics: { reach: [], engagement: [], community: [], conversion: [] },
      plan: { days30: [], days60: [], days90: [] },
    });
    expect(doc.positioning).toBe("x");
    expect(doc.goals).toEqual([]);
    expect(doc.pillars.map((p) => p.share)).toEqual([50, 50]);
    expect(doc.pillars[0].examples).toEqual(["e1"]);
    expect(doc.cadence).toEqual([{ platform: "instagram", format: "ig_reel", perWeek: 2.5 }]);
  });
});

describe("starter strategy and planner", () => {
  const facts = [
    ...Array.from({ length: 6 }, (_, i) => fact(i, { pillar: "education", likes: 90 })),
    ...Array.from({ length: 4 }, (_, i) => fact(10 + i, { pillar: "Offer", format: "post", likes: 20 })),
  ];
  const history = summarizeHistory(facts, { periodDays: 90, timeZone: "Asia/Kolkata", followers: 9820 });

  it("summarises history", () => {
    expect(history.posts).toBe(10);
    expect(history.pillars.map((p) => [p.name, p.posts])).toEqual([
      ["Education", 6],
      ["Offer", 4],
    ]);
    expect(history.formats[0].format).toBe("reel");
    expect(history.bestSlot).toEqual({ slot: "evening", time: "19:00" });
  });

  it("keeps pillars that already work, weighted to the better ones", () => {
    const doc = starterStrategy(inputs, history, [], "Cafe");
    expect(doc.pillars.map((p) => p.name)).toEqual(["Education", "Offer"]);
    expect(doc.pillars[0].share).toBeGreaterThan(60);
    expect(doc.pillars.reduce((a, p) => a + p.share, 0)).toBe(100);
    expect(doc.goals[0].target).toContain("10,606");
    expect(doc.cadence.every((c) => ["instagram", "facebook"].includes(c.platform))).toBe(true);
  });

  it("falls back to objective defaults without history", () => {
    const doc = starterStrategy({ ...inputs, objective: "sales" }, null, [], "Cafe");
    expect(doc.pillars.map((p) => p.name)).toEqual(["Product", "Offers", "Proof", "Education"]);
  });

  it("plans 30 days: right number of posts, Idea Bank topics, festivals on their day", () => {
    const doc = starterStrategy(inputs, history, [], "Cafe");
    const weekly = doc.cadence.reduce((a, c) => a + c.perWeek, 0);
    const moments = upcomingMoments({ year: 2026, month: 10, day: 6 }, 30, { regions: ["north"] });
    const rows = planDays({
      start: { year: 2026, month: 10, day: 6 },
      days: 30,
      doc,
      objective: "awareness",
      history,
      moments,
      ideas: [{ id: "i1", title: "Chai vs coffee taste test", pillar: "Education" }],
    });
    expect(rows.length).toBeGreaterThanOrEqual(Math.round((weekly * 30) / 7));
    expect(rows.every((r) => r.date >= "2026-10-06" && r.date < "2026-11-06" && r.time === "19:00")).toBe(true);
    expect(rows.find((r) => r.ideaId === "i1")?.topic).toBe("Chai vs coffee taste test");
    const dussehra = rows.find((r) => r.momentId === "dussehra-2026");
    expect(dussehra?.date).toBeDefined();
    expect(dussehra!.date <= "2026-10-20" && dussehra!.date >= "2026-10-17").toBe(true);
    expect(rows.every((r) => r.cta === "Follow for more")).toBe(true);
  });
});
