"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar, buttonClass } from "@/components/ui";

type Person = { id: string; name: string; email: string; role: string };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const ROLE = { owner: "Owner", admin: "Admin", manager: "Manager", editor: "Editor" } as Record<string, string>;

/** SP-02 Members tab: who works in this space; add existing members or take them out. */
export function SpaceMembers(props: {
  spaceName: string;
  me: string;
  canManage: boolean;
  members: (Person & { automatic: boolean })[];
  addable: Person[];
  inviteHref: string;
  add: (userIds: string[]) => Promise<Result>;
  remove: (userId: string) => Promise<Result<{ tasks: number; posts: number }>>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Person | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-5">
      <p aria-live="polite" className={`min-h-5 text-sm ${message?.error ? "text-danger" : "text-muted"}`}>
        {pending ? "Saving…" : message?.text}
      </p>
      <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
        {props.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={m.name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {m.name} {m.id === props.me && <span className="font-normal text-muted">(you)</span>}
              </p>
              <p className="truncate text-[13px] text-muted">{m.email}</p>
            </div>
            <span className="text-sm text-ink-2">{ROLE[m.role]}</span>
            {m.automatic ? (
              <span className="w-32 text-right text-xs text-muted">In every space</span>
            ) : props.canManage ? (
              confirm?.id === m.id ? (
                <span className="flex items-center gap-2 text-sm">
                  Take {m.name.split(" ")[0]} out?
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await props.remove(m.id);
                        setConfirm(null);
                        setMessage(r.ok ? { text: `${m.name} is out of ${props.spaceName}.${r.tasks || r.posts ? ` Unassigned from ${[r.tasks && `${r.tasks} open task${r.tasks === 1 ? "" : "s"}`, r.posts && `${r.posts} post${r.posts === 1 ? "" : "s"}`].filter(Boolean).join(" and ")}.` : ""}` } : { text: r.error, error: true });
                      })
                    }
                    className="rounded-md bg-danger px-2.5 py-1 font-semibold text-white"
                  >
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="font-semibold text-muted">
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirm(m)} className={`${buttonClass("ghost", "sm")} w-32 justify-end hover:text-danger`}>
                  Remove from space
                </button>
              )
            ) : (
              <span className="w-32" />
            )}
          </li>
        ))}
      </ul>

      {props.canManage && (
        <section aria-labelledby="add-members" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <h2 id="add-members" className="font-semibold">
            Add people to {props.spaceName}
          </h2>
          {props.addable.length === 0 ? (
            <p className="text-sm text-muted">
              Every Manager and Editor is already here.{" "}
              <Link href={props.inviteHref} className="font-semibold underline">
                Invite someone new
              </Link>
            </p>
          ) : (
            <>
              <ul className="flex flex-col">
                {props.addable.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-subtle">
                      <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-muted">{ROLE[p.role]}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={picked.length === 0 || pending}
                  onClick={() =>
                    start(async () => {
                      const r = await props.add(picked);
                      setMessage(r.ok ? { text: `Added ${picked.length} ${picked.length === 1 ? "person" : "people"}.` } : { text: r.error, error: true });
                      if (r.ok) setPicked([]);
                    })
                  }
                  className={buttonClass("primary", "sm")}
                >
                  Add {picked.length || ""} to space
                </button>
                <Link href={props.inviteHref} className="text-sm font-semibold text-muted hover:text-ink">
                  Invite someone new
                </Link>
              </div>
            </>
          )}
          <p className="text-xs text-muted">Taking someone out unassigns their open tasks and posts here.</p>
        </section>
      )}
    </div>
  );
}
