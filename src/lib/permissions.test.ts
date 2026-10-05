import { describe, expect, it } from "vitest";
import { can } from "./permissions";

const member = { isSpaceMember: true, editorsCanSchedule: false };
const outsider = { isSpaceMember: false, editorsCanSchedule: false };

describe("permissions (PRD section 4)", () => {
  it("keeps billing with the Owner only", () => {
    expect(can("owner", "org.billing")).toBe(true);
    expect(can("admin", "org.billing")).toBe(false);
  });

  it("lets Owner and Admin create spaces, not Managers", () => {
    expect(can("admin", "space.create")).toBe(true);
    expect(can("manager", "space.create")).toBe(false);
  });

  it("gives Admins every space without being added", () => {
    expect(can("admin", "content.schedule", outsider)).toBe(true);
  });

  it("limits Managers and Editors to spaces they were added to", () => {
    expect(can("manager", "content.edit", outsider)).toBe(false);
    expect(can("editor", "content.edit", outsider)).toBe(false);
    expect(can("editor", "content.edit", member)).toBe(true);
  });

  it("lets Editors schedule only when the space allows it", () => {
    expect(can("editor", "content.schedule", member)).toBe(false);
    expect(can("editor", "content.schedule", { ...member, editorsCanSchedule: true })).toBe(true);
    expect(can("manager", "content.schedule", member)).toBe(true);
  });

  it("keeps space settings and account connections away from Editors", () => {
    expect(can("editor", "space.settings", member)).toBe(false);
    expect(can("editor", "accounts.connect", member)).toBe(false);
    expect(can("manager", "accounts.connect", member)).toBe(true);
  });
});
