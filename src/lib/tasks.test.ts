import { describe, expect, it } from "vitest";
import { cleanChecklist, dueState, formatForPlacements, localInput, planTemplate } from "./tasks";

describe("task templates (TK-04)", () => {
  it("picks the format from the post's platforms", () => {
    expect(formatForPlacements(["ig_post", "fb_reel"])).toBe("reel");
    expect(formatForPlacements(["ig_carousel"])).toBe("carousel");
    expect(formatForPlacements(["ig_story", "fb_story"])).toBe("story");
    expect(formatForPlacements(["ig_story", "ig_post"])).toBe("post");
    expect(formatForPlacements([])).toBe("post");
  });

  it("counts due dates back from the publish date, never into the past", () => {
    const publish = new Date("2026-10-20T12:30:00Z");
    const now = new Date("2026-10-15T00:00:00Z");
    const steps = planTemplate("reel", publish, now, []);
    expect(steps.map((s) => s.title)).toEqual(["Script", "Shoot", "Edit", "Thumbnail", "Client approval", "Publish"]);
    expect(steps[0].dueAt).toEqual(now); // 6 days before is already past
    expect(steps[2].dueAt?.toISOString()).toBe("2026-10-17T12:30:00.000Z");
    expect(steps[5].dueAt).toEqual(publish);
  });

  it("skips steps the post already has, by template or by title", () => {
    const steps = planTemplate("post", null, new Date(), [
      { title: "Anything", templateKey: "post:write-the-caption" },
      { title: "client approval", templateKey: null },
    ]);
    expect(steps.map((s) => s.title)).toEqual(["Design or pick the photo", "Publish"]);
    expect(steps.every((s) => s.dueAt === null)).toBe(true);
  });
});

describe("checklist and due dates", () => {
  it("keeps valid, unique, non-empty items", () => {
    expect(cleanChecklist([{ id: "a", text: " Hook ", done: true }, { id: "a", text: "dup", done: false }, { id: "b", text: "  ", done: false }, { id: "bad id!", text: "x" }, "junk"])).toEqual([
      { id: "a", text: "Hook", done: true },
    ]);
  });

  it("calls out overdue, today and tomorrow in the space's time zone", () => {
    const now = new Date("2026-10-06T10:00:00Z"); // 3:30 PM in India
    expect(dueState(new Date("2026-10-06T09:00:00Z"), false, now, "Asia/Kolkata")).toBe("overdue");
    expect(dueState(new Date("2026-10-06T09:00:00Z"), true, now, "Asia/Kolkata")).toBeNull();
    expect(dueState(new Date("2026-10-06T17:00:00Z"), false, now, "Asia/Kolkata")).toBe("today");
    expect(dueState(new Date("2026-10-06T19:00:00Z"), false, now, "Asia/Kolkata")).toBe("tomorrow");
    expect(localInput("2026-10-06T12:30:00Z", "Asia/Kolkata")).toBe("2026-10-06T18:00");
  });
});
