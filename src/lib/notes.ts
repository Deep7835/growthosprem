// Note documents (VW-06): what is stored, what can be searched and who is mentioned.
// Documents come from the browser, so they are sanitised before saving: only known node
// and mark types, safe link targets, and a size limit.

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

const NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "mention",
  "emoji",
]);
const MARKS = new Set(["bold", "italic", "strike", "underline", "code", "link"]);
export const MAX_DOC_CHARS = 400_000;

/** http(s), mailto and in-app paths only: no javascript: or data: links. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  return null;
}

const ATTRS: Record<string, string[]> = {
  heading: ["level"],
  orderedList: ["start", "type"],
  taskItem: ["checked"],
  codeBlock: ["language"],
  mention: ["id", "label", "mentionSuggestionChar"],
  emoji: ["name"],
};

function cleanAttrs(type: string, attrs: Record<string, unknown> | undefined) {
  const keep = ATTRS[type];
  if (!keep || !attrs) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keep) {
    const v = attrs[k];
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
  }
  if (type === "heading") out.level = [1, 2, 3].includes(Number(out.level)) ? Number(out.level) : 2;
  return out;
}

function clean(node: unknown, depth: number): DocNode | null {
  if (!node || typeof node !== "object" || depth > 40) return null;
  const n = node as DocNode;
  if (typeof n.type !== "string" || !NODES.has(n.type)) return null;
  const out: DocNode = { type: n.type };
  const attrs = cleanAttrs(n.type, n.attrs);
  if (attrs) out.attrs = attrs;
  if (n.type === "text") {
    if (typeof n.text !== "string" || n.text === "") return null;
    out.text = n.text;
    const marks = (Array.isArray(n.marks) ? n.marks : [])
      .filter((m) => m && MARKS.has(m.type))
      .map((m) => {
        if (m.type !== "link") return { type: m.type };
        const href = safeHref(m.attrs?.href);
        return href ? { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } } : null;
      })
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    if (marks.length) out.marks = marks;
    return out;
  }
  if (Array.isArray(n.content)) {
    const children = n.content.map((c) => clean(c, depth + 1)).filter((c): c is DocNode => Boolean(c));
    if (children.length) out.content = children;
  }
  return out;
}

/** A safe copy of a document, or an error if it isn't one or is too large. */
export function sanitizeDoc(input: unknown): DocNode {
  const doc = clean(input, 0);
  if (!doc || doc.type !== "doc") throw new Error("That isn’t a note document.");
  if (JSON.stringify(doc).length > MAX_DOC_CHARS) throw new Error("This note is too long. Split it into two notes.");
  return doc;
}

const BLOCKS = new Set(["paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock"]);

/** Plain text (for search and previews), the people mentioned and the posts linked. */
export function summarize(doc: DocNode) {
  const mentions = new Set<string>();
  const posts = new Set<string>();
  const parts: string[] = [];
  const walk = (n: DocNode) => {
    if (n.type === "text") parts.push(n.text ?? "");
    else if (n.type === "mention") {
      const id = String(n.attrs?.id ?? "");
      const isPost = n.attrs?.mentionSuggestionChar === "[[";
      parts.push(isPost ? `“${n.attrs?.label ?? "post"}”` : `@${n.attrs?.label ?? ""}`);
      if (/^[0-9a-f-]{36}$/.test(id)) (isPost ? posts : mentions).add(id);
    } else if (n.type === "hardBreak") parts.push("\n");
    for (const c of n.content ?? []) walk(c);
    if (BLOCKS.has(n.type)) parts.push("\n");
  };
  walk(doc);
  const text = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
  return { text, mentions: [...mentions], posts: [...posts] };
}

/** First line of text, for the note list when a note has no title. */
export function excerpt(text: string, length = 90) {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line;
}
