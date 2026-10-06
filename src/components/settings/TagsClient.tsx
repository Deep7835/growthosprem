"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { buttonClass } from "@/components/ui";
import type { SettingsResult } from "@/app/o/[org]/settings/actions";
import type { TagRow } from "@/server/org-settings";

const field = "h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[15px] outline-none focus:border-ink";

export function TagsClient(props: {
  tags: TagRow[];
  canEdit: boolean;
  add: (name: string) => Promise<SettingsResult>;
  rename: (from: string, to: string) => Promise<SettingsResult>;
  remove: (name: string) => Promise<SettingsResult>;
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ name: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<SettingsResult>, done: string, then?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast("error", "Couldn’t save", r.error);
      toast("success", done);
      then?.();
    });
  const q = query.trim().toLowerCase();
  const shown = props.tags.filter((t) => !q || t.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex h-10 items-center gap-2 rounded-lg bg-line-soft px-3 text-muted">
        <Icon name="search" size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tags" aria-label="Search tags" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted" />
      </label>
      {props.canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(() => props.add(draft), `Added “${draft.trim()}”`, () => setDraft(""));
          }}
          className="flex gap-2"
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Enter tag name" aria-label="New tag" maxLength={40} className={field} />
          <button type="submit" disabled={pending || !draft.trim()} className={`${buttonClass("primary")} h-10 px-4`}>
            Add tag
          </button>
        </form>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          {props.tags.length === 0 ? "No tags yet. Tags you add here are suggested when tagging posts in the Table." : `No tags match “${query.trim()}”.`}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft rounded-xl border border-line">
          {shown.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              {editing?.name === t.name ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => props.rename(t.name, editing.value), "Tag renamed", () => setEditing(null));
                  }}
                  className="flex min-w-0 flex-1 gap-2"
                >
                  <input autoFocus value={editing.value} onChange={(e) => setEditing({ name: t.name, value: e.target.value })} aria-label={`Rename ${t.name}`} maxLength={40} className={`${field} h-9`} />
                  <button type="submit" disabled={pending || !editing.value.trim() || editing.value.trim() === t.name} className={buttonClass("primary", "sm")}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className={buttonClass("ghost", "sm")}>
                    Cancel
                  </button>
                </form>
              ) : confirm === t.name ? (
                <div role="alertdialog" aria-label={`Delete ${t.name}`} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-danger">
                    Delete “{t.name}”?{t.uses ? ` It comes off ${t.uses} post${t.uses === 1 ? "" : "s"}.` : ""}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setConfirm(null)} className={buttonClass("ghost", "sm")}>
                      Cancel
                    </button>
                    <button type="button" disabled={pending} onClick={() => act(() => props.remove(t.name), "Tag deleted", () => setConfirm(null))} className="h-8 rounded-lg bg-danger px-3 text-[13px] font-semibold text-white">
                      Delete
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Icon name="tag" className="text-muted" />
                    <span className="truncate font-medium">{t.name}</span>
                    {!t.listed && <span className="rounded bg-subtle px-1.5 text-[11px] text-muted">from posts</span>}
                  </span>
                  <span className="text-sm text-muted">
                    {t.uses} post{t.uses === 1 ? "" : "s"}
                  </span>
                  {props.canEdit && (
                    <span className="flex gap-1">
                      <button type="button" onClick={() => setEditing({ name: t.name, value: t.name })} aria-label={`Rename ${t.name}`} className="grid size-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
                        <Icon name="pencil" size={15} />
                      </button>
                      <button type="button" onClick={() => setConfirm(t.name)} aria-label={`Delete ${t.name}`} className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger-bg hover:text-danger">
                        <Icon name="trash" size={15} />
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
