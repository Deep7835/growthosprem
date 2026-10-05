import { describe, expect, it } from "vitest";
import { highlight, shortAgo, snippet } from "./search";

describe("search palette text", () => {
  it("shows the words around a match without cutting words", () => {
    const text = "Our monsoon special is back.\nTry the masala chai with pakoras every evening at the cafe this week only.";
    expect(snippet(text, "masala", 12, 20)).toBe("…Try the masala chai with pakoras…");
    expect(snippet("Short one", "short")).toBe("Short one");
    expect(snippet("Nothing here", "diwali")).toBeNull();
  });

  it("splits text for highlighting, ignoring case", () => {
    expect(highlight("Diwali hamper, DIWALI box", "diwali")).toEqual([
      { text: "Diwali", match: true },
      { text: " hamper, ", match: false },
      { text: "DIWALI", match: true },
      { text: " box", match: false },
    ]);
  });

  it("says how long ago, briefly", () => {
    const now = new Date("2026-10-05T12:00:00Z").getTime();
    expect(shortAgo("2026-10-05T11:55:00Z", now)).toBe("5m ago");
    expect(shortAgo("2026-10-05T09:00:00Z", now)).toBe("3h ago");
    expect(shortAgo("2026-10-07T12:00:00Z", now)).toBe("in 2d");
  });
});
