import { describe, expect, it } from "vitest";
import { checkReadiness, issuesFor, itemPublishState, mediaIssues, type ReadinessInput, type ReadinessMedia } from "./rules";

const now = new Date("2026-10-05T10:00:00Z");
const img = (id: string, w = 1080, h = 1350): ReadinessMedia => ({ id, type: "image", status: "ready", filename: `${id}.jpg`, sizeBytes: 300_000, width: w, height: h, durationSeconds: null });
const vid = (id: string, seconds = 20, w = 1080, h = 1920): ReadinessMedia => ({ id, type: "video", status: "ready", filename: `${id}.mp4`, sizeBytes: 20_000_000, width: w, height: h, durationSeconds: seconds });

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    mode: "autopost",
    when: new Date(now.getTime() + 3600_000),
    now,
    item: { caption: "Monsoon menu is here", hashtags: "#cafe", firstComment: "" },
    status: { name: "Approved", autopostEligible: true },
    requireApproval: true,
    approved: true,
    placements: [{ id: "p1", kind: "ig_post", state: "draft", captionOverride: null, account: { handle: "@cafe", status: "active", canPublish: true } }],
    media: [img("a")],
    mediaReachable: true,
    ...over,
  };
}

const codes = (i: ReadinessInput) => checkReadiness(i).map((x) => x.code);

describe("readiness check", () => {
  it("passes a ready post", () => {
    expect(checkReadiness(input())).toEqual([]);
  });

  it("lists every blocking problem with a fix", () => {
    const issues = checkReadiness(
      input({
        when: new Date(now.getTime() - 1000),
        approved: false,
        status: { name: "Idea", autopostEligible: false },
        placements: [{ id: "p1", kind: "ig_post", state: "draft", captionOverride: null, account: null }],
        media: [],
      }),
    );
    expect(issues.map((i) => [i.code, i.fix.kind])).toEqual([
      ["time.past", "time"],
      ["approval.missing", "approval"],
      ["status.ineligible", "status"],
      ["account.missing", "accounts"],
      ["media.missing", "media"],
    ]);
  });

  it("only checks timing, caption and approval for a manual (reminder) schedule", () => {
    expect(codes(input({ mode: "manual", status: { name: "Idea", autopostEligible: false }, placements: [{ id: "p1", kind: "ig_post", state: "draft", captionOverride: null, account: null }], media: [] }))).toEqual([]);
  });

  it("doesn't need a time to post now", () => {
    expect(codes(input({ mode: "now", when: null }))).toEqual([]);
  });

  it("refuses sample accounts and accounts that need reconnecting", () => {
    const sample = input({ placements: [{ id: "p1", kind: "ig_post", state: "draft", captionOverride: null, account: { handle: "@cafe", status: "active", canPublish: false } }] });
    expect(checkReadiness(sample)[0].message).toMatch(/sample data/);
    const broken = input({ placements: [{ id: "p1", kind: "ig_post", state: "draft", captionOverride: null, account: { handle: "@cafe", status: "reconnect_needed", canPublish: false } }] });
    expect(checkReadiness(broken)[0].message).toMatch(/needs reconnecting/);
  });

  it("checks caption length per platform and Instagram's hashtag limit", () => {
    expect(codes(input({ item: { caption: "x".repeat(2201), hashtags: "", firstComment: "" } }))).toEqual(["caption.length"]);
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(codes(input({ item: { caption: "Hi", hashtags: tags, firstComment: "" } }))).toEqual(["caption.hashtags"]);
  });

  it("blocks media Meta can't fetch", () => {
    expect(codes(input({ mediaReachable: false }))).toEqual(["media.unreachable"]);
  });

  it("ignores placements that already published", () => {
    const i = input({
      placements: [
        { id: "p1", kind: "ig_post", state: "published", captionOverride: null, account: null },
        { id: "p2", kind: "fb_post", state: "failed", captionOverride: null, account: { handle: "Cafe", status: "active", canPublish: true } },
      ],
    });
    expect(checkReadiness(i)).toEqual([]);
  });

  it("separates a placement's own issues from the post's", () => {
    const issues = checkReadiness(
      input({
        approved: false,
        placements: [
          { id: "p1", kind: "ig_post", state: "draft", captionOverride: null, account: null },
          { id: "p2", kind: "fb_post", state: "draft", captionOverride: null, account: { handle: "Cafe", status: "active", canPublish: true } },
        ],
      }),
    );
    expect(issuesFor("p2", issues).map((i) => i.code)).toEqual(["approval.missing"]);
    expect(issuesFor("p1", issues).map((i) => i.code)).toEqual(["approval.missing", "account.missing"]);
  });
});

describe("media rules per placement", () => {
  const c = (kind: Parameters<typeof mediaIssues>[1], media: ReadinessMedia[]) => mediaIssues("p", kind, media).map((i) => i.code);

  it("Instagram post: one image in range", () => {
    expect(c("ig_post", [img("a")])).toEqual([]);
    expect(c("ig_post", [img("a", 1080, 1920)])).toEqual(["media.ratio"]);
    expect(c("ig_post", [vid("v")])).toEqual(["media.ig_video"]);
    expect(c("ig_post", [img("a"), img("b")])).toEqual(["media.ig_many"]);
  });

  it("carousel: 2 to 10 items", () => {
    expect(c("ig_carousel", [img("a")])).toEqual(["media.carousel_count"]);
    expect(c("ig_carousel", [img("a"), vid("v", 30, 1080, 1350)])).toEqual([]);
  });

  it("reels: one video of the right length", () => {
    expect(c("ig_reel", [vid("v", 2)])).toEqual(["media.duration"]);
    expect(c("fb_reel", [vid("v", 120)])).toEqual(["media.duration"]);
    expect(c("fb_reel", [vid("v", 30, 1920, 1080)])).toEqual(["media.ratio"]);
    expect(c("fb_reel", [vid("v", 30)])).toEqual([]);
  });

  it("flags media that isn't ready and documents", () => {
    expect(c("fb_post", [{ ...img("a"), status: "processing" }])).toEqual(["media.not_ready"]);
    expect(c("fb_post", [{ ...img("d"), type: "document" }])).toContain("media.document");
  });
});

describe("item publish state", () => {
  it("derives from placements", () => {
    expect(itemPublishState(["draft"])).toBe("not_scheduled");
    expect(itemPublishState(["scheduled", "scheduled"])).toBe("scheduled");
    expect(itemPublishState(["published", "scheduled"])).toBe("publishing");
    expect(itemPublishState(["published", "published"])).toBe("published");
    expect(itemPublishState(["published", "failed"])).toBe("partially_published");
    expect(itemPublishState(["failed", "failed"])).toBe("failed");
  });
});
