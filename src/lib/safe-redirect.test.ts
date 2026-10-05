import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("allows same-site paths", () => {
    expect(safeRedirect("/invite/abc")).toBe("/invite/abc");
  });
  it("blocks other sites", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", undefined, ["/x"]]) {
      expect(safeRedirect(bad)).toBeNull();
    }
  });
});
