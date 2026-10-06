"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { buttonClass } from "@/components/ui";
import type { ToolResult } from "@/app/o/[org]/ai/tools-actions";

type Saved = { id: string; title: string; body: string };

/** AI › Prompts: the built-in library and your saved prompts. "Use" opens a chat with it filled in. */
export function PromptsClient({ org, library, saved, save, remove }: { org: string; library: { group: string; prompts: { title: string; body: string }[] }[]; saved: Saved[]; save: (p: { id?: string; title: string; body: string }) => Promise<ToolResult>; remove: (id: string) => Promise<ToolResult> }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id?: string; title: string; body: string } | null>(null);
  const [pending, start] = useTransition();
  const q = query.trim().toLowerCase();
  const match = (p: { title: string; body: string }) => !q || `${p.title} ${p.body}`.toLowerCase().includes(q);
  const chatHref = (body: string) => `/o/${org}/ai?prompt=${encodeURIComponent(body)}`;

  const card = (p: { title: string; body: string }, extra?: React.ReactNode) => (
    <li key={p.title + p.body.slice(0, 20)} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <b className="text-[14.5px]">{p.title}</b>
      <p className="line-clamp-3 flex-1 text-[13px] text-muted">{p.body}</p>
      <div className="flex items-center gap-2">
        <Link href={chatHref(p.body)} className={`${buttonClass("secondary", "sm")} gap-1`}>
          Use <Icon name="chevronRight" size={13} />
        </Link>
        {extra}
      </div>
    </li>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 pb-14">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Prompt library</h1>
          <p className="text-sm text-muted">Start from a ready-made prompt or save your own to reuse with AI Copilot.</p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search prompts…" aria-label="Search prompts" className="h-9 w-64 rounded-lg border border-line bg-surface px-3 text-sm" />
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your prompts</h2>
          <button type="button" onClick={() => setEditing({ title: "", body: "" })} className={`${buttonClass("primary", "sm")} gap-1`}>
            <Icon name="plus" size={14} /> New prompt
          </button>
        </div>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await save(editing);
                if (!r.ok) return void toast("error", "Couldn’t save the prompt", r.error);
                toast("success", "Prompt saved");
                setEditing(null);
              });
            }}
            className="flex flex-col gap-2 rounded-xl border border-ink/20 bg-subtle p-4"
          >
            <input autoFocus value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Name, e.g. Monday plan for Cafe" aria-label="Prompt name" maxLength={120} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" />
            <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={4} placeholder="What should AI Copilot do?" aria-label="Prompt" maxLength={4000} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={buttonClass("ghost", "sm")}>
                Cancel
              </button>
              <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
                {pending ? "Saving…" : "Save prompt"}
              </button>
            </div>
          </form>
        )}
        {saved.length === 0 && !editing ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No saved prompts yet. Save one you use often, like your Monday planning request.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.filter(match).map((p) =>
              card(
                p,
                <>
                  <button type="button" onClick={() => setEditing(p)} aria-label={`Edit ${p.title}`} className="grid size-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
                    <Icon name="pencil" size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.title}`}
                    onClick={() =>
                      start(async () => {
                        const r = await remove(p.id);
                        if (!r.ok) toast("error", "Couldn’t delete it", r.error);
                      })
                    }
                    className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger-bg hover:text-danger"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>,
              ),
            )}
          </ul>
        )}
      </section>

      {library.map((g) => {
        const list = g.prompts.filter(match);
        if (!list.length) return null;
        return (
          <section key={g.group} className="flex flex-col gap-3">
            <h2 className="border-b border-line pb-1.5 text-sm font-semibold">{g.group}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{list.map((p) => card(p))}</ul>
          </section>
        );
      })}
    </div>
  );
}
