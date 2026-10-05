import { describe, expect, it } from "vitest";
import { buildPreviews, frameRatio, tokenize, truncate, TRUNCATION } from "./preview";

describe("caption truncation", () => {
  it("cuts Instagram feed captions after 2 lines or 125 characters, at a word", () => {
    const long = "Is Diwali, har visit ho meetha. 20% off all sweets from 1 to 8 Nov. Tag the friend who owes you a treat and come say hi this weekend at Cafe.";
    const r = truncate(long, TRUNCATION.ig_post);
    expect(r.cut).toBe(true);
    expect(r.shown.length).toBeLessThanOrEqual(125);
    expect(long.startsWith(r.shown)).toBe(true);
    expect(r.shown.endsWith(" ")).toBe(false);
    expect(truncate("Line one\nLine two\nLine three", TRUNCATION.ig_post)).toEqual({ shown: "Line one\nLine two", cut: true });
  });

  it("keeps short captions whole", () => {
    expect(truncate("Brunch is on.", TRUNCATION.li_post)).toEqual({ shown: "Brunch is on.", cut: false });
  });

  it("shows no caption on Stories", () => {
    expect(truncate("Anything", TRUNCATION.ig_story)).toEqual({ shown: "", cut: false });
  });
});

describe("caption highlighting", () => {
  it("finds hashtags, mentions and links, including Hindi", () => {
    expect(tokenize("Hi @cafe.delhi, see https://x.in #दिवाली #cafe!").map((t) => [t.kind, t.text])).toEqual([
      ["text", "Hi "],
      ["mention", "@cafe.delhi"],
      ["text", ", see "],
      ["link", "https://x.in"],
      ["text", " "],
      ["hashtag", "#दिवाली"],
      ["text", " "],
      ["hashtag", "#cafe"],
      ["text", "!"],
    ]);
  });
});

describe("media frames", () => {
  it("clamps Instagram feed media to 4:5 … 1.91:1 and uses 9:16 for Reels and Stories", () => {
    expect(frameRatio("ig_post", [{ width: 1080, height: 1920 }])).toBe(0.8);
    expect(frameRatio("ig_carousel", [{ width: 1080, height: 1080 }])).toBe(1);
    expect(frameRatio("fb_post", [{ width: 1080, height: 1920 }])).toBeCloseTo(0.5625);
    expect(frameRatio("ig_reel", [])).toBeCloseTo(9 / 16);
    expect(frameRatio("li_post", [])).toBe(1);
  });
});

describe("building previews", () => {
  it("uses each placement's account and caption, and only media and caption issues", () => {
    const [ig, fb] = buildPreviews({
      item: { caption: "Brunch", hashtags: "#cafe", firstComment: "" },
      placements: [
        { id: "p1", kind: "ig_story", captionOverride: null, account: { handle: "@cafe.delhi", name: "Cafe Delhi" } },
        { id: "p2", kind: "fb_post", captionOverride: "Facebook only", account: null },
      ],
      media: [{ id: "m1", type: "video", width: 1080, height: 1920, hasThumb: true }],
      space: { name: "Cafe", color: "#F2A93B" },
      when: null,
      issues: [
        { placementId: "p1", code: "media.duration", message: "Too long" },
        { placementId: "p1", code: "account.missing", message: "Connect" },
        { code: "approval.missing", message: "Approve" },
      ],
      src: (id, v) => `/m/${id}/${v}`,
    });
    expect(ig.account.handle).toBe("@cafe.delhi");
    expect(ig.caption).toBe("Brunch\n\n#cafe");
    expect(ig.media[0]).toMatchObject({ src: "/m/m1/original", poster: "/m/m1/thumb" });
    expect(ig.issues).toEqual(["Too long"]);
    expect(fb.caption).toBe("Facebook only\n\n#cafe");
    expect(fb.account.name).toBe("Cafe");
    expect(fb.issues).toEqual([]);
  });
});
