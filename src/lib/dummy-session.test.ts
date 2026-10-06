import { describe, expect, it } from "vitest";
import { passwordMatches, readSession, sessionValue } from "./dummy-session";

const key = Buffer.alloc(32, 7);
const id = "8b0f4a52-6a8e-4d1c-9a43-2f0b7f6d1c11";

describe("dummy sign-in session", () => {
  it("reads back the user it was made for", () => {
    expect(readSession(sessionValue(id, key), key)).toBe(id);
  });

  it("refuses edited, foreign-key and expired cookies", () => {
    const value = sessionValue(id, key);
    const [, expires, sig] = value.split(".");
    expect(readSession(`00000000-0000-4000-8000-000000000000.${expires}.${sig}`, key)).toBeNull();
    expect(readSession(value, Buffer.alloc(32, 8))).toBeNull();
    expect(readSession(value, key, new Date(Date.now() + 31 * 864e5))).toBeNull();
    expect(readSession("nonsense", key)).toBeNull();
    expect(readSession(undefined, key)).toBeNull();
  });

  it("checks the shared password", () => {
    expect(passwordMatches("plotline", "plotline")).toBe(true);
    expect(passwordMatches("plotlin", "plotline")).toBe(false);
  });
});
