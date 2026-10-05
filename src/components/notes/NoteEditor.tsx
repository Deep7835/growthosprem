"use client";

import Emoji, { gitHubEmojis, type EmojiItem } from "@tiptap/extension-emoji";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, Extension, ReactRenderer, useEditor, type Editor, type Range } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Suggestion, { type SuggestionOptions, type SuggestionProps } from "@tiptap/suggestion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./SuggestionList";

type SaveResult = { ok: true; savedAt: string; notified: number } | { ok: false; error: string };

interface Props {
  noteId: string;
  initialTitle: string;
  initialContent: unknown;
  editable: boolean;
  people: { id: string; name: string }[];
  posts: { id: string; title: string }[];
  /** Where a linked post opens: the board with its panel. */
  postBase: string;
  save: (input: { title?: string; content?: unknown }) => Promise<SaveResult>;
}

/** A pop-up list for one trigger character, positioned by the suggestion plugin. */
function popup(empty: string, toProps: (item: SuggestionItem) => unknown = (i) => i): SuggestionOptions["render"] {
  return () => {
    let component: ReactRenderer<SuggestionListHandle, { items: SuggestionItem[]; command: (item: SuggestionItem) => void; empty: string }> | null = null;
    let unmount: (() => void) | null = null;
    const listProps = (props: SuggestionProps) => ({
      items: props.items as SuggestionItem[],
      command: (item: SuggestionItem) => props.command(toProps(item)),
      empty,
    });
    return {
      onStart: (props) => {
        component = new ReactRenderer(SuggestionList, { props: listProps(props), editor: props.editor });
        unmount = props.mount(component.element as HTMLElement);
      },
      onUpdate: (props) => component?.updateProps(listProps(props)),
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          unmount?.();
          unmount = null;
          return true;
        }
        return component?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        unmount?.();
        component?.destroy();
        component = null;
        unmount = null;
      },
    };
  };
}

interface SlashItem extends SuggestionItem {
  run: (editor: Editor, range: Range) => void;
}

const SLASH: SlashItem[] = [
  { id: "h1", label: "Heading", hint: "Big section heading", icon: "H1", run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run() },
  { id: "h2", label: "Subheading", hint: "Medium heading", icon: "H2", run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run() },
  { id: "h3", label: "Small heading", icon: "H3", run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run() },
  { id: "todo", label: "Checklist", hint: "Action items with checkboxes", icon: "☑", run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { id: "bullets", label: "Bulleted list", icon: "•", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { id: "numbers", label: "Numbered list", icon: "1.", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { id: "quote", label: "Quote", icon: "❝", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { id: "divider", label: "Divider", icon: "—", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { id: "post", label: "Link a post", hint: "Or type [[", icon: "📄", run: (e, r) => e.chain().focus().deleteRange(r).insertContent("[[").run() },
  { id: "mention", label: "Mention someone", hint: "Or type @", icon: "@", run: (e, r) => e.chain().focus().deleteRange(r).insertContent("@").run() },
  { id: "emoji", label: "Emoji", hint: "Or type :", icon: "🙂", run: (e, r) => e.chain().focus().deleteRange(r).insertContent(":").run() },
];

/** "/" opens the block menu (VW-06). */
const SlashCommands = Extension.create({
  name: "slashCommands",
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        items: ({ query }) => SLASH.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()) || c.id.startsWith(query.toLowerCase())),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: popup("No matching command"),
      }),
    ];
  },
});

const match = (text: string, query: string) => text.toLowerCase().includes(query.toLowerCase());

export function NoteEditor(props: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(props.initialTitle);
  const [state, setState] = useState<{ kind: "idle" | "pending" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const pending = useRef<{ title?: string; content?: unknown }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const input = pending.current;
    if (input.title === undefined && input.content === undefined) return;
    pending.current = {};
    setState({ kind: "saving" });
    const result = await latest.current.save(input);
    if (result.ok) setState({ kind: "saved", message: result.notified ? `Saved · ${result.notified} ${result.notified === 1 ? "person" : "people"} notified` : "Saved" });
    else {
      // Keep the unsaved change so Retry sends it again.
      pending.current = { ...input, ...pending.current };
      setState({ kind: "error", message: result.error });
    }
  }

  function queue(change: { title?: string; content?: unknown }) {
    pending.current = { ...pending.current, ...change };
    setState({ kind: "pending" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }

  // Save before leaving the note, and warn if the tab closes with unsaved changes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current.title !== undefined || pending.current.content !== undefined) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
     
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    // The toolbar shows which formats are active, so re-render as the selection moves.
    shouldRerenderOnTransaction: true,
    editable: props.editable,
    content: props.initialContent as object,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Write, or type / for headings, checklists, @mentions and post links…") }),
      Emoji.configure({
        emojis: gitHubEmojis,
        enableEmoticons: true,
        suggestion: {
          items: ({ editor, query }) =>
            (editor.storage.emoji.emojis as EmojiItem[])
              .filter((e) => e.emoji && e.shortcodes.some((s) => s.startsWith(query.toLowerCase())))
              .slice(0, 8)
              .map((e) => ({ id: e.name, label: `:${e.shortcodes[0]}:`, icon: e.emoji })),
          render: popup("No matching emoji", (item) => ({ name: item.id })),
        },
      }),
      Mention.configure({
        deleteTriggerWithBackspace: true,
        renderText: ({ node }) => (node.attrs.mentionSuggestionChar === "[[" ? `“${node.attrs.label}”` : `@${node.attrs.label}`),
        renderHTML: ({ node }) =>
          node.attrs.mentionSuggestionChar === "[["
            ? ["a", { href: `${latest.current.postBase}?content=${node.attrs.id}`, "data-post": node.attrs.id, class: "note-post" }, `📄 ${node.attrs.label}`]
            : ["span", { class: "note-mention", "data-user": node.attrs.id }, `@${node.attrs.label}`],
        suggestions: [
          {
            char: "@",
            items: ({ query }) =>
              latest.current.people
                .filter((p) => match(p.name, query))
                .slice(0, 8)
                .map((p) => ({ id: p.id, label: p.name, icon: p.name[0] })),
            render: popup("Nobody by that name in this space", (item) => ({ id: item.id, label: item.label })),
          },
          {
            char: "[[",
            allowSpaces: true,
            items: ({ query }) =>
              latest.current.posts
                .filter((p) => match(p.title, query))
                .slice(0, 8)
                .map((p) => ({ id: p.id, label: p.title, icon: "📄" })),
            render: popup("No post with that title", (item) => ({ id: item.id, label: item.label })),
          },
        ],
      }),
      SlashCommands,
    ],
    editorProps: {
      attributes: { class: "note-content min-h-[420px] outline-none", "aria-label": "Note" },
      // Post links open the post; everything else behaves like normal editing.
      handleClick: (_view, _pos, event) => {
        const link = (event.target as HTMLElement).closest("a[data-post]") as HTMLAnchorElement | null;
        if (!link) return false;
        event.preventDefault();
        router.push(link.getAttribute("href")!);
        return true;
      },
    },
    // A plain copy: the editor's attribute objects have no prototype, which server actions refuse.
    onUpdate: ({ editor }) => queue({ content: JSON.parse(JSON.stringify(editor.getJSON())) }),
  });

  const button = (label: string, active: boolean, run: () => void, title?: string) => (
    <button
      type="button"
      title={title ?? label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-[13px] font-semibold ${active ? "bg-ink text-white" : "text-ink-2 hover:bg-subtle"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={title}
          readOnly={!props.editable}
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value });
          }}
          placeholder="Untitled note"
          aria-label="Note title"
          className="min-w-0 flex-1 bg-transparent font-display text-3xl font-bold outline-none placeholder:text-faint"
        />
        <span role="status" className={`text-xs ${state.kind === "error" ? "text-danger" : "text-muted"}`}>
          {state.kind === "pending" && "Unsaved changes"}
          {state.kind === "saving" && "Saving…"}
          {state.kind === "saved" && state.message}
          {state.kind === "error" && (
            <>
              Couldn’t save: {state.message}{" "}
              <button type="button" onClick={() => void flush()} className="font-semibold underline">
                Retry
              </button>
            </>
          )}
        </span>
      </div>

      {props.editable && editor && (
        <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-surface/95 p-1 backdrop-blur">
          {button("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold (Ctrl+B)")}
          {button("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic (Ctrl+I)")}
          {button("S", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "Strikethrough")}
          <span className="mx-1 h-5 w-px bg-line" />
          {button("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          {button("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {button("•", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "Bulleted list")}
          {button("1.", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Numbered list")}
          {button("☑", editor.isActive("taskList"), () => editor.chain().focus().toggleTaskList().run(), "Checklist")}
          {button("❝", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "Quote")}
          {button(
            "Link",
            editor.isActive("link"),
            () => {
              const current = editor.getAttributes("link").href as string | undefined;
              const url = window.prompt("Link address (https://…)", current ?? "https://");
              if (url === null) return;
              if (!url || url === "https://") editor.chain().focus().extendMarkRange("link").unsetLink().run();
              else if (/^(https?:\/\/|mailto:)/i.test(url)) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            },
            "Link",
          )}
          <span className="flex-1" />
          <span className="hidden px-2 text-xs text-muted sm:inline">/ commands · @ people · [[ posts · : emoji</span>
          {button("↶", false, () => editor.chain().focus().undo().run(), "Undo (Ctrl+Z)")}
          {button("↷", false, () => editor.chain().focus().redo().run(), "Redo (Ctrl+Shift+Z)")}
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
