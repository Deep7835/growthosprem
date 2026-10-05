import { describe, expect, it } from "vitest";
import { excerpt, safeHref, sanitizeDoc, summarize } from "./notes";

const u1 = "11111111-1111-4111-8111-111111111111";
const p1 = "22222222-2222-4222-8222-222222222222";

describe("note documents", () => {
  it("keeps known nodes and marks and drops the rest", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 9, onclick: "x" }, content: [{ type: "text", text: "Brief" }] },
        { type: "script", content: [{ type: "text", text: "alert(1)" }] },
        { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }, { type: "evil" }] }] },
      ],
    });
    expect(doc).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Brief" }] },
        { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }] }] },
      ],
    });
  });

  it("only allows safe links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref("https://cafe.in")).toBe("https://cafe.in");
    expect(safeHref("/o/x/s/y/board")).toBe("/o/x/s/y/board");
    const doc = sanitizeDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:x" } }] }] }] });
    expect(doc.content![0].content![0].marks).toBeUndefined();
  });

  it("refuses things that aren't documents or are too large", () => {
    expect(() => sanitizeDoc({ type: "paragraph" })).toThrow();
    expect(() => sanitizeDoc("nope")).toThrow();
    const huge = { type: "doc", content: Array.from({ length: 2000 }, () => ({ type: "paragraph", content: [{ type: "text", text: "x".repeat(300) }] })) };
    expect(() => sanitizeDoc(huge)).toThrow(/too long/);
  });

  it("finds text, mentioned people and linked posts", () => {
    const s = summarize({
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Diwali brief" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Ask " },
            { type: "mention", attrs: { id: u1, label: "Riya" } },
            { type: "text", text: " about " },
            { type: "mention", attrs: { id: p1, label: "Diwali offer", mentionSuggestionChar: "[[" } },
          ],
        },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Shoot" }] }] }] },
      ],
    });
    expect(s.text).toBe("Diwali brief\nAsk @Riya about “Diwali offer”\nShoot");
    expect(s.mentions).toEqual([u1]);
    expect(s.posts).toEqual([p1]);
  });

  it("makes short excerpts", () => {
    expect(excerpt("\n\nFirst line here\nSecond")).toBe("First line here");
    expect(excerpt("x".repeat(100), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
