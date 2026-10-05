import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, parseKey, seal } from "./crypto";

describe("token encryption", () => {
  const key = randomBytes(32);

  it("round-trips and never stores the plain text", () => {
    const sealed = seal("EAAG-secret-page-token", key);
    expect(sealed).not.toContain("secret");
    expect(open(sealed, key)).toBe("EAAG-secret-page-token");
  });

  it("uses a fresh IV each time", () => {
    expect(seal("same", key)).not.toBe(seal("same", key));
  });

  it("rejects a tampered value or the wrong key", () => {
    const sealed = seal("token", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(parts.join("."), key)).toThrow();
    expect(() => open(sealed, randomBytes(32))).toThrow();
  });

  it("only accepts 32-byte keys", () => {
    expect(() => parseKey(Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
    expect(parseKey(key.toString("base64"))).toEqual(key);
  });
});
