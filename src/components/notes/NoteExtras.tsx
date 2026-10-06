"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { menuItem, Popover } from "@/components/Popover";
import { toast } from "@/components/Toaster";
import { Avatar, buttonClass } from "@/components/ui";
import { NoteEditor } from "./NoteEditor";

export interface NoteComment {
  id: string;
  body: string;
  createdAt: string;
  author: string;
}

/** The note's "···" menu: Duplicate, Copy link, Print or save as PDF, Delete. */
export function NoteMenu({ printHref, canEdit, duplicate, onDelete }: { printHref: string; canEdit: boolean; duplicate: () => Promise<void>; onDelete: () => void }) {
  const [, start] = useTransition();
  return (
    <Popover label="Note actions" buttonClassName="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-subtle aria-expanded:bg-subtle" panelClassName="right-0 top-full mt-1 w-56" button={<Icon name="more" size={18} />}>
      {(close) => (
        <div className="flex flex-col">
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                close();
                start(() => duplicate());
              }}
              className={menuItem}
            >
              <Icon name="board" /> Duplicate
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              close();
              await navigator.clipboard.writeText(window.location.href);
              toast("success", "Link copied", "Teammates in this space can open it.");
            }}
            className={menuItem}
          >
            <Icon name="link" /> Copy link
          </button>
          <a href={printHref} target="_blank" rel="noreferrer" onClick={close} className={menuItem}>
            <Icon name="download" /> Print or save as PDF
          </a>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                close();
                onDelete();
              }}
              className={`${menuItem} text-danger hover:text-danger`}
            >
              <Icon name="trash" /> Delete
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

/** Team comments under a note (never shown to clients); @name mentions notify. */
export function NoteComments({ comments, canEdit, now, post }: { comments: NoteComment[]; canEdit: boolean; now: number; post: (body: string) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const ago = (iso: string) => {
    const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
    const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    return minutes < 60 ? f.format(-minutes, "minute") : minutes < 2880 ? f.format(-Math.round(minutes / 60), "hour") : f.format(-Math.round(minutes / 1440), "day");
  };
  const send = () =>
    start(async () => {
      const r = await post(draft);
      if (r.ok) setDraft("");
      else toast("error", "Couldn’t post the comment", r.error);
    });
  return (
    <section aria-label="Comments" className="flex flex-col gap-3 border-t border-line pt-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="comment" size={15} /> Team comments {comments.length > 0 && <span className="font-normal text-muted">· {comments.length}</span>}
      </h2>
      {comments.length === 0 && <p className="text-sm text-muted">Discuss this note with your team. Clients never see these comments.</p>}
      <ol className="flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <Avatar name={c.author} size={28} />
            <div className="min-w-0 flex-1 rounded-xl bg-subtle px-3 py-2">
              <p className="text-[13px]">
                <b>{c.author}</b> <span className="text-muted">· {ago(c.createdAt)}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-line text-sm">{c.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) send();
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={5000}
            placeholder="Write a comment… use @name to notify someone"
            aria-label="Write a comment"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Ctrl/⌘ Enter to send</span>
            <button type="submit" disabled={pending || !draft.trim()} className={buttonClass("primary", "sm")}>
              {pending ? "Posting…" : "Comment"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** The print view: the note read-only, then the browser's print dialog (Save as PDF lives there). */
export function PrintableNote({ title, content }: { title: string; content: unknown }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <NoteEditor
      noteId="print"
      initialTitle={title}
      initialContent={content}
      editable={false}
      people={[]}
      posts={[]}
      postBase=""
      save={async () => ({ ok: true, savedAt: new Date().toISOString(), notified: 0 })}
    />
  );
}
