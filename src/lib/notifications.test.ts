import { describe, expect, it } from "vitest";
import { channelsFor, cleanPrefs, effectivePrefs, kindsOf, localClock, typeOf } from "./notifications";

describe("notification types", () => {
  it("maps events to the PRD's types, unknown ones to System", () => {
    expect(typeOf("publish_failed")).toBe("action_required");
    expect(typeOf("mention")).toBe("comments");
    expect(typeOf("review_changes")).toBe("review");
    expect(typeOf("something_new")).toBe("system");
    expect(kindsOf("tasks").sort()).toEqual(["task_due", "task_overdue"]);
  });
});

describe("preferences", () => {
  it("keeps Action required in-app whatever is saved", () => {
    expect(cleanPrefs({ action_required: { inApp: false, email: false }, bogus: { inApp: true } })).toEqual({ action_required: { inApp: true, email: false } });
  });

  it("uses the space's setting, then the person's default, then ours", () => {
    expect(channelsFor("publishing", {})).toEqual({ inApp: true, email: false });
    expect(channelsFor("publishing", { base: { publishing: { inApp: false, email: true } } })).toEqual({ inApp: false, email: true });
    expect(channelsFor("publishing", { base: { publishing: { inApp: false, email: true } }, space: { publishing: { inApp: true, email: false } } })).toEqual({ inApp: true, email: false });
    expect(effectivePrefs({}).action_required).toEqual({ inApp: true, email: true });
  });
});

describe("digest clock", () => {
  it("reads the hour and date in the person's time zone", () => {
    const at = new Date("2026-10-05T03:30:00Z");
    expect(localClock(at, "Asia/Kolkata")).toEqual({ hour: 9, date: "2026-10-05" });
    expect(localClock(at, "America/New_York")).toEqual({ hour: 23, date: "2026-10-04" });
    expect(localClock(at, "Not/AZone").hour).toBe(9);
  });
});
