import { describe, expect, it } from "vitest";
import { creditsFor } from "./config";
import { labelClaims } from "./claims";

const facts = [JSON.stringify({ reachShare: 0.7213, engagementRate: "7.6%", followers: 13452, posts: 26, best: "Wed 6–9 PM" })];

describe("source labels", () => {
  it("labels claims and keeps the text around them", () => {
    const s = labelClaims("Reels brought 72% of reach. [Your data] Post 5 Reels a week. [AI suggestion] Want a plan?", facts);
    expect(s.map((x) => x.label)).toEqual(["data", "ai", undefined]);
    expect(s[0].text).toBe("Reels brought 72% of reach.");
    expect(s[2].text.trim()).toBe("Want a plan?");
  });

  it("accepts numbers from the facts, including rounded percentages and comma grouping", () => {
    const s = labelClaims("You have 13,452 followers from 26 posts, with a 7.6% engagement rate and 72.1% of reach from Reels. [Your data]", facts);
    expect(s[0].label).toBe("data");
  });

  it("flags a data claim with a number that is not in the facts", () => {
    const s = labelClaims("Followers grew 12% this month. [Your data]", facts);
    expect(s[0].label).toBe("unverified");
  });

  it("does not check numbers in suggestions", () => {
    expect(labelClaims("Try 5 Reels a week. [AI suggestion]", facts)[0].label).toBe("ai");
  });
});

describe("credits", () => {
  it("charges 1 credit per US$0.01, at least 1", () => {
    expect(creditsFor("claude-opus-5-5", { input_tokens: 1000, output_tokens: 1000 })).toBe(3); // $0.024
    expect(creditsFor("claude-sonnet-5-5", { input_tokens: 10, output_tokens: 10 })).toBe(1);
  });
});
