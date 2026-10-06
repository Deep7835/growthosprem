"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { SpaceResult } from "@/app/o/[org]/settings/spaces/actions";
import type { AdminSpace } from "@/server/spaces";
import { CreateSpaceDialog, type CreateSpaceOptions } from "./CreateSpaceDialog";

/** SP-01, SP-05, SP-06: every space in the organisation, for the Owner and Admins. */
export function SpacesAdmin(props: {
  org: string;
  isOwner: boolean;
  spaces: AdminSpace[];
  options: CreateSpaceOptions;
  startOpen: boolean;
  add: (input: unknown) => Promise<SpaceResult<{ href: string }>>;
  archive: (id: string, archived: boolean) => Promise<SpaceResult<{ paused: number }>>;
  remove: (id: string, typedName: string) => Promise<SpaceResult<{ paused: number }>>;
  restore: (id: string) => Promise<SpaceResult>;
}) {
  const [creating, setCreating] = useState(props.startOpen);
  const [deleting, setDeleting] = useState<AdminSpace | null>(null);
  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const found = props.spaces.filter((s) => !q || s.name.toLowerCase().includes(q));
  const active = found.filter((s) => !s.archived && !s.deletedAt);
  const archived = found.filter((s) => s.archived && !s.deletedAt);
  const deleted = found.filter((s) => s.deletedAt);

  const act = <T,>(fn: () => Promise<SpaceResult<T>>, done: (r: { ok: true } & T) => string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { text: done(r) } : { text: r.error, error: true });
    });
  const paused = (n: number) => (n ? ` ${n} scheduled post${n === 1 ? " was" : "s were"} unscheduled.` : "");

  const row = (s: AdminSpace, actions: React.ReactNode) => (
    <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold" style={{ background: s.color }}>
        {s.name[0]}
      </span>
      <div className="min-w-0 flex-1">
        {s.deletedAt ? <p className="font-semibold">{s.name}</p> : (
          <Link href={`/o/${props.org}/s/${s.slug}/board`} className="font-semibold hover:underline">
            {s.name}
          </Link>
        )}
        <p className="text-[13px] text-muted">
          {s.deletedAt
            ? `Deleted. Removed for good in ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"}.`
            : `${s.members} member${s.members === 1 ? "" : "s"} · ${s.posts} post${s.posts === 1 ? "" : "s"}${s.scheduled ? ` · ${s.scheduled} scheduled` : ""}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">{actions}</div>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Spaces</h1>
          <p className="text-sm text-muted">One space per client or brand, each with its own accounts, content, statuses and Brand Brain.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className={buttonClass("primary", "sm")}>
          + New space
        </button>
      </div>
      {props.spaces.length > 4 && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search spaces" aria-label="Search spaces" className="h-10 rounded-lg bg-line-soft px-3 text-[15px] outline-none focus:bg-surface focus:ring-1 focus:ring-line" />
      )}
      <p aria-live="polite" className={`min-h-5 text-sm ${message?.error ? "text-danger" : "text-muted"}`}>
        {pending ? "Working…" : message?.text}
      </p>

      <section aria-labelledby="active-spaces" className="flex flex-col gap-2">
        <h2 id="active-spaces" className="font-semibold">
          Active <span className="font-normal text-muted">{active.length}</span>
        </h2>
        <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
          {active.map((s) =>
            row(
              s,
              <>
                <Link href={`/o/${props.org}/s/${s.slug}/settings/members`} className={buttonClass("ghost", "sm")}>
                  Members
                </Link>
                <Link href={`/o/${props.org}/s/${s.slug}/settings/space`} className={buttonClass("ghost", "sm")}>
                  Settings
                </Link>
                <button type="button" disabled={pending} onClick={() => act(() => props.archive(s.id, true), (r) => `Archived ${s.name}.${paused(r.paused)}`)} className={buttonClass("ghost", "sm")}>
                  Archive
                </button>
              </>,
            ),
          )}
        </ul>
      </section>

      {archived.length > 0 && (
        <section aria-labelledby="archived-spaces" className="flex flex-col gap-2">
          <h2 id="archived-spaces" className="font-semibold">
            Archived <span className="font-normal text-muted">{archived.length} · hidden from the sidebar and read-only</span>
          </h2>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {archived.map((s) =>
              row(
                s,
                <>
                  <button type="button" disabled={pending} onClick={() => act(() => props.archive(s.id, false), () => `Restored ${s.name}. Reschedule any posts that were paused.`)} className={buttonClass("secondary", "sm")}>
                    Restore
                  </button>
                  <button type="button" onClick={() => { setDeleting(s); setTyped(""); }} className={`${buttonClass("ghost", "sm")} hover:text-danger`}>
                    Delete
                  </button>
                </>,
              ),
            )}
          </ul>
        </section>
      )}

      {deleted.length > 0 && (
        <section aria-labelledby="deleted-spaces" className="flex flex-col gap-2">
          <h2 id="deleted-spaces" className="font-semibold">
            Recently deleted <span className="font-normal text-muted">· only you, the Owner, can restore these</span>
          </h2>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {deleted.map((s) =>
              row(
                s,
                <button type="button" disabled={pending} onClick={() => act(() => props.restore(s.id), () => `Restored ${s.name}. It’s archived; restore it from Archived to use it again.`)} className={buttonClass("secondary", "sm")}>
                  Restore
                </button>,
              ),
            )}
          </ul>
        </section>
      )}

      {active.length > 0 && (
        <p className="text-xs text-muted">To delete an active space, archive it first. Deleted spaces can be restored by the Owner for 30 days, then they’re removed for good with their media.</p>
      )}

      {creating && <CreateSpaceDialog options={props.options} add={props.add} onClose={() => setCreating(false)} />}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[12vh]" onKeyDown={(e) => e.key === "Escape" && setDeleting(null)}>
          <button type="button" aria-label="Close" className="fixed inset-0 cursor-default" onClick={() => setDeleting(null)} />
          <div role="dialog" aria-modal="true" aria-label={`Delete ${deleting.name}?`} className="relative flex w-full max-w-md flex-col gap-3 rounded-2xl bg-surface p-5 text-sm shadow-2xl">
            <h2 className="font-display text-xl font-bold">Delete {deleting.name}?</h2>
            <p className="text-muted">
              Its {deleting.posts} post{deleting.posts === 1 ? "" : "s"}, tasks, notes, media and connected accounts go with it. {props.isOwner ? "You" : "The Owner"} can restore it for 30 days; after that it’s gone for good.
            </p>
            <label className="flex flex-col gap-1 font-semibold">
              <span>
                Type <span className="rounded bg-subtle px-1 font-mono">{deleting.name}</span> to confirm
              </span>
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="h-10 rounded-lg border border-line px-3 font-normal" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className={buttonClass("ghost")}>
                Cancel
              </button>
              <button
                type="button"
                disabled={typed !== deleting.name || pending}
                onClick={() => {
                  const s = deleting;
                  act(() => props.remove(s.id, typed), (r) => `Deleted ${s.name}.${paused(r.paused)}`);
                  setDeleting(null);
                }}
                className={`${buttonClass("primary")} bg-danger hover:bg-danger disabled:bg-line`}
              >
                Delete space
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
