import { describe, expect, it } from "vitest";
import { generateDemoHistory } from "@/db/demo-history";
import { computeReport, type RangeDays } from "./report";

const NOW = new Date("2026-10-05T06:30:00Z"); // Monday 5 Oct, 12:00 IST
const TZ = "Asia/Kolkata";
const history = generateDemoHistory(NOW, TZ);
const accounts = [
  { id: "ig", platform: "instagram" as const, handle: "@cafe.delhi" },
  { id: "fb", platform: "facebook" as const, handle: "Cafe Delhi" },
];
const posts = history.posts.map((p, i) => ({ ...p, id: `p${i}`, accountId: p.platform === "instagram" ? "ig" : "fb" }));
const snapshots = [
  ...history.followers.instagram.map((f) => ({ accountId: "ig", ...f })),
  ...history.followers.facebook.map((f) => ({ accountId: "fb", ...f })),
];

function report(days: RangeDays, platform: "all" | "instagram" | "facebook" = "all") {
  return computeReport({ posts, snapshots, accounts, days, platform, now: NOW, timeZone: TZ });
}

describe("analytics report", () => {
  it("adds up followers across accounts and measures growth from snapshots", () => {
    const r = report(90);
    expect(r.kpis.followers.value).toBe(9820 + 3632);
    expect(r.kpis.followerGrowth).toBe(r.kpis.followers.value - r.kpis.followers.start!);
    expect(r.followerSeries.at(-1)).toEqual({ day: "2026-10-05", followers: 13452 });
  });

  it("compares with the previous period only when history reaches back that far", () => {
    expect(report(30).canCompare).toBe(true);
    expect(report(30).kpis.views.previous).not.toBeNull();
    expect(report(90).canCompare).toBe(false);
    expect(report(90).kpis.views.previous).toBeNull();
  });

  it("filters every number by platform", () => {
    const all = report(90);
    const ig = report(90, "instagram");
    const fb = report(90, "facebook");
    expect(ig.kpis.posts.value + fb.kpis.posts.value).toBe(all.kpis.posts.value);
    expect(ig.kpis.views.value + fb.kpis.views.value).toBe(all.kpis.views.value);
    expect(ig.kpis.followers.value).toBe(9820);
  });

  it("splits contribution by platform into shares that add up to 1", () => {
    const shares = report(30).contribution.views.map((c) => c.share);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("only gives an engagement rate to groups with at least 5 posts", () => {
    const r = report(30);
    for (const g of [...r.breakdowns.byFormat, ...r.breakdowns.byPillar]) {
      if (g.posts < 5) expect(g.engagementRate).toBeNull();
      else expect(g.engagementRate).toBeGreaterThan(0);
    }
    const stories = r.breakdowns.byFormat.find((g) => g.name === "Stories")!;
    expect(stories.engagementRate).toBeNull();
  });

  it("explains what happened, why and what next", () => {
    const r = report(30);
    expect(r.insights.happened).toMatch(/^Followers grew \d+\.\d%, from [\d,]+ to 13,452\. Views were (up|down) \d+% on the previous 30 days\.$/);
    expect(r.insights.why.length).toBeGreaterThan(0);
    expect(r.insights.next?.key).toBe("more-reel");
    expect(report(30, "facebook").insights.next?.key).toBe("more-reel");
  });

  it("lists the period's posts sorted by views", () => {
    const r = report(30);
    expect(r.posts.length).toBe(r.kpis.posts.value);
    expect(r.posts[0].views).toBeGreaterThanOrEqual(r.posts.at(-1)!.views);
  });
});
