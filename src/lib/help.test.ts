import { describe, expect, it } from "vitest";
import { HELP_ARTICLES, searchHelp } from "./help";

describe("help search", () => {
  it("matches every word, in any order, across title and text", () => {
    expect(searchHelp("client approve").map((a) => a.slug)).toEqual(["client-approval"]);
    expect(searchHelp("GST invoice").map((a) => a.slug)).toContain("billing-gst");
    expect(searchHelp("")).toEqual([]);
    expect(searchHelp("zzzz")).toEqual([]);
  });

  it("has unique slugs", () => {
    expect(new Set(HELP_ARTICLES.map((a) => a.slug)).size).toBe(HELP_ARTICLES.length);
  });
});
