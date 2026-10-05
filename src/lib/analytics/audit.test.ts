import { describe, expect, it } from "vitest";
import { generateDemoHistory } from "@/db/demo-history";
import { computeAudit, type PostFact } from "./audit";
import { zonedParts, zonedToUtc } from "./time";

const NOW = new Date("2026-10-05T06:30:00Z"); // Monday 5 Oct, 12:00 IST
const TZ = "Asia/Kolkata";

function demoFacts(): PostFact[] {
  return generateDemoHistory(NOW, TZ).posts.map((p, i) => ({ ...p, id: `p${i}` }));
}

function audit(posts: PostFact[]) {
  return computeAudit(posts, { followers: 13452, periodDays: 90, now: NOW, timeZone: TZ, platforms: ["instagram", "facebook"] });
}

describe("time helpers", () => {
  it("converts IST wall-clock time to UTC", () => {
    expect(zonedToUtc(2026, 10, 31, 19, 0, TZ).toISOString()).toBe("2026-10-31T13:30:00.000Z");
    expect(zonedParts(new Date("2026-10-31T13:30:00Z"), TZ)).toMatchObject({ day: 31, hour: 19, weekday: 5 });
  });
});

describe("first audit on the sample history", () => {
  const result = audit(demoFacts());

  it("covers 26 posts inside the 90-day window", () => {
    expect(result.postCount).toBe(26);
    for (const p of demoFacts()) {
      expect(p.publishedAt.getTime()).toBeLessThan(NOW.getTime());
      expect(NOW.getTime() - p.publishedAt.getTime()).toBeLessThanOrEqual(91 * 864e5);
    }
  });

  it("finds that Reels carry reach and offers lag", () => {
    const keys = result.findings.map((f) => f.key);
    expect(keys).toContain("format-reach-reel");
    expect(keys).toContain("pillar-lag-offer");
    expect(keys).toContain("uneven-posting");
    const reels = result.findings.find((f) => f.key === "format-reach-reel")!;
    expect(reels.evidence.values.reachShare).toBeGreaterThan(0.6);
  });

  it("gives three recommendations, each with evidence", () => {
    expect(result.recommendations.map((r) => r.key)).toEqual(["more-reel", "lead-with-education", "post-evening"]);
    for (const r of result.recommendations) expect(r.evidence.sampleSize).toBeGreaterThanOrEqual(5);
    expect(result.recommendations[2].title).toBe("Post on Wednesday and Friday evenings");
  });

  it("drafts two weeks starting next Monday, on the best days and time", () => {
    expect(result.plan).toHaveLength(8);
    expect(result.plan[0].date >= "2026-10-12").toBe(true);
    expect(result.plan.every((p) => p.time === "19:00")).toBe(true);
    const weekdays = new Set(result.plan.map((p) => p.weekday));
    expect(weekdays.has(2) && weekdays.has(4)).toBe(true);
    // The offer closes each week, after the educational posts.
    expect(result.plan[3].pillar).toBe("Offer");
    expect(result.plan[3].placements).toEqual(["ig_post", "fb_post"]);
    expect(new Set(result.plan.map((p) => p.key)).size).toBe(8);
  });

  it("is deterministic", () => {
    expect(audit(demoFacts())).toEqual(result);
  });
});

describe("guards", () => {
  it("does not audit fewer than 5 posts", () => {
    const r = audit(demoFacts().slice(0, 4));
    expect(r.enough).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it("does not compare pillars with fewer than 5 posts each", () => {
    const posts = demoFacts().map((p) => ({ ...p, pillar: p.pillar === "offer" ? (Number(p.id.slice(1)) % 3 === 0 ? "offer" : "education") : p.pillar }));
    const offers = posts.filter((p) => p.pillar === "offer").length;
    expect(offers).toBeLessThan(5);
    expect(audit(posts).findings.map((f) => f.key)).not.toContain("pillar-lag-offer");
  });
});
