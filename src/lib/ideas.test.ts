import { describe, expect, it } from "vitest";
import { cleanLinks, filterIdeas, groupByPillar, linkLabel, pillarNames, type IdeaLike } from "./ideas";

const idea = (over: Partial<IdeaLike>): IdeaLike => ({ id: "x", title: "Idea", notes: "", source: "me", pillar: null, tags: [], contentItemId: null, createdAt: "2026-10-01", ...over });

describe("idea links", () => {
  it("keeps http(s) links, adds https to bare domains, drops the rest", () => {
    expect(
      cleanLinks([
        { url: "instagram.com/p/abc" },
        { url: "javascript:alert(1)" },
        { url: "https://www.zomato.com/delhi", title: "  Competitor menu " },
        { url: "https://instagram.com/p/abc" },
        { url: "" },
      ]),
    ).toEqual([{ url: "https://instagram.com/p/abc" }, { url: "https://www.zomato.com/delhi", title: "Competitor menu" }]);
    expect(linkLabel({ url: "https://www.zomato.com/delhi" })).toBe("zomato.com");
  });
});

describe("idea filters and groups", () => {
  const list = [
    idea({ id: "a", title: "Chai vs coffee", pillar: "Education", tags: ["reel"] }),
    idea({ id: "b", title: "Barista POV", pillar: "behind the scenes", source: "ai" }),
    idea({ id: "c", title: "Monsoon combo", pillar: "education", contentItemId: "p1" }),
    idea({ id: "d", title: "Diwali hamper" }),
  ];

  it("filters by text, source, pillar, tag and whether it became a post", () => {
    expect(filterIdeas(list, { q: "monsoon" }).map((i) => i.id)).toEqual(["c"]);
    expect(filterIdeas(list, { source: "ai" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterIdeas(list, { pillar: "EDUCATION" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterIdeas(list, { pillar: "none" }).map((i) => i.id)).toEqual(["d"]);
    expect(filterIdeas(list, { tag: "Reel" }).map((i) => i.id)).toEqual(["a"]);
    expect(filterIdeas(list, { used: "hide" }).map((i) => i.id)).toEqual(["a", "b", "d"]);
  });

  it("groups pillars case-insensitively, biggest first, no pillar last", () => {
    expect(groupByPillar(list).map((g) => [g.pillar, g.ideas.length])).toEqual([
      ["Education", 2],
      ["behind the scenes", 1],
      [null, 1],
    ]);
  });

  it("lists pillar names with their most common spelling", () => {
    expect(pillarNames(["Offer", "offer", "Offer", "Education", null, " "])).toEqual(["Education", "Offer"]);
  });
});
