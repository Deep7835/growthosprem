import { describe, expect, it } from "vitest";
import { snapshotDue } from "./checkpoints";

const H = 36e5;
const published = new Date("2026-10-01T10:00:00Z");
const at = (hours: number) => new Date(published.getTime() + hours * H);

describe("metrics snapshot schedule", () => {
  it("takes a first snapshot for a post that has none", () => {
    expect(snapshotDue(published, null, at(0.2))).toBe(true);
  });

  it("waits for the next checkpoint", () => {
    expect(snapshotDue(published, at(1.1), at(5))).toBe(false);
    expect(snapshotDue(published, at(1.1), at(24))).toBe(true);
    expect(snapshotDue(published, at(25), at(71))).toBe(false);
    expect(snapshotDue(published, at(25), at(73))).toBe(true);
  });

  it("catches up after a gap with one snapshot", () => {
    expect(snapshotDue(published, at(2), at(200))).toBe(true);
  });

  it("freezes after 30 days", () => {
    expect(snapshotDue(published, at(721), at(2000))).toBe(false);
    expect(snapshotDue(published, at(400), at(2000))).toBe(true);
  });
});
