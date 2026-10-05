import { describe, expect, it } from "vitest";
import { cleanTags, matches, sortRows, type FilterableRow } from "./table";

const row = (over: Partial<FilterableRow>): FilterableRow => ({
  id: "x",
  title: "Post",
  statusId: "s1",
  projectId: null,
  scheduledAt: null,
  scheduledLocal: null,
  kinds: [],
  assigneeIds: [],
  tags: [],
  publishState: "not_scheduled",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  archived: false,
  ...over,
});
const ctx = { me: "u1", nowLocal: "2026-10-05T12:00" };

describe("table filters", () => {
  it("hides archived posts unless asked for them", () => {
    expect(matches(row({ archived: true }), {}, ctx)).toBe(false);
    expect(matches(row({ archived: true }), { archived: "1" }, ctx)).toBe(true);
    expect(matches(row({}), { archived: "1" }, ctx)).toBe(false);
  });

  it("filters by assignee, platform, tag, project, status and publishing", () => {
    const r = row({ assigneeIds: ["u1"], kinds: ["ig_reel"], tags: ["Diwali"], projectId: "p1", statusId: "s2", publishState: "scheduled" });
    expect(matches(r, { assignee: "me", platform: "instagram", tag: "diwali", project: "p1", status: "s2", publish: "scheduled" }, ctx)).toBe(true);
    expect(matches(r, { assignee: "none" }, ctx)).toBe(false);
    expect(matches(r, { platform: "facebook" }, ctx)).toBe(false);
    expect(matches(r, { project: "none" }, ctx)).toBe(false);
  });

  it("filters by date windows in the space's local time", () => {
    const soon = row({ scheduledLocal: "2026-10-09T10:00", scheduledAt: "x" });
    const later = row({ scheduledLocal: "2026-10-20T10:00", scheduledAt: "x" });
    const past = row({ scheduledLocal: "2026-10-01T10:00", scheduledAt: "x" });
    expect([soon, later, past].map((r) => matches(r, { date: "week" }, ctx))).toEqual([true, false, false]);
    expect([soon, later, past].map((r) => matches(r, { date: "month" }, ctx))).toEqual([true, true, false]);
    expect([soon, later, past].map((r) => matches(r, { date: "past" }, ctx))).toEqual([false, false, true]);
    expect(matches(row({}), { date: "unscheduled" }, ctx)).toBe(true);
  });

  it("searches titles and tags", () => {
    expect(matches(row({ title: "Monsoon menu" }), { q: "monsoon" }, ctx)).toBe(true);
    expect(matches(row({ tags: ["offer"] }), { q: "OFF" }, ctx)).toBe(true);
    expect(matches(row({}), { q: "nothing" }, ctx)).toBe(false);
  });
});

describe("table sort", () => {
  const a = row({ id: "a", title: "Brunch", scheduledAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" });
  const b = row({ id: "b", title: "Apple", scheduledAt: null, updatedAt: "2026-10-04T00:00:00Z", createdAt: "2026-09-05T00:00:00Z" });
  const c = row({ id: "c", title: "Chai", scheduledAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", createdAt: "2026-09-03T00:00:00Z" });
  const ids = (rows: FilterableRow[]) => rows.map((r) => r.id);

  it("sorts by schedule with undated posts last, and by update, creation and title", () => {
    expect(ids(sortRows([a, b, c], "schedule_asc"))).toEqual(["c", "a", "b"]);
    expect(ids(sortRows([a, b, c], "schedule_desc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortRows([a, b, c], "updated_desc"))).toEqual(["b", "a", "c"]);
    expect(ids(sortRows([a, b, c], "created_desc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortRows([a, b, c], "title_asc"))).toEqual(["b", "a", "c"]);
  });
});

describe("tags", () => {
  it("trims, drops #, dedupes case-insensitively and caps length", () => {
    expect(cleanTags([" #Diwali ", "diwali", "Monsoon  menu", "", "x".repeat(50)])).toEqual(["Diwali", "Monsoon menu", "x".repeat(40)]);
  });
});
