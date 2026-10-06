"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { PlatformLogo, buttonClass } from "@/components/ui";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ThreadRow {
  id: string;
  platform: "instagram" | "facebook";
  kind: "comment" | "message";
  participant: string;
  preview: string;
  lastAt: string;
  unread: boolean;
  done: boolean;
  sample: boolean;
}

export interface OpenThread extends ThreadRow {
  messages: { id: string; direction: "in" | "out"; author: string; body: string; sentAt: string }[];
  post: { title: string; permalink: string | null } | null;
}

/** Inbox (beta): comments on the space's posts, answered from Plotline. */
export function InboxView(props: {
  base: string;
  filter: { kind: "all" | "comment" | "message"; status: "open" | "done"; q: string };
  threads: ThreadRow[];
  current: OpenThread | null;
  connected: boolean;
  sampleMode: boolean;
  canReply: boolean;
  canEdit: boolean;
  now: number;
  reply: (threadId: string, body: string) => Promise<Result<{ sample: boolean }>>;
  setDone: (threadId: string, done: boolean) => Promise<Result>;
  addSamples: () => Promise<Result<{ added: number }>>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState(props.filter.q);
  const [pending, start] = useTransition();
  const href = (changes: Partial<{ kind: string; status: string; q: string; t: string | null }>) => {
    const p = new URLSearchParams();
    const next = { kind: props.filter.kind, status: props.filter.status, q: props.filter.q, t: props.current?.id ?? null, ...changes };
    if (next.kind !== "all") p.set("kind", next.kind);
    if (next.status !== "open") p.set("status", next.status);
    if (next.q) p.set("q", next.q);
    if (next.t) p.set("t", next.t);
    const s = p.toString();
    return s ? `${props.base}?${s}` : props.base;
  };
  const ago = (iso: string) => {
    const m = Math.max(0, Math.round((props.now - Date.parse(iso)) / 60000));
    const f = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
    return m < 60 ? f.format(-m, "minute") : m < 2880 ? f.format(-Math.round(m / 60), "hour") : f.format(-Math.round(m / 1440), "day");
  };
  const t = props.current;

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col md:flex-row">
      <aside aria-label="Conversations" className="flex w-full shrink-0 flex-col gap-2 border-line p-3 md:w-[340px] md:border-r">
        <nav aria-label="Show" className="flex gap-1 rounded-lg bg-line-soft p-[3px] text-[13px]">
          {(
            [
              ["all", "All"],
              ["message", "Messages"],
              ["comment", "Comments"],
            ] as const
          ).map(([k, label]) => (
            <Link key={k} href={href({ kind: k, t: null })} aria-current={props.filter.kind === k ? "true" : undefined} className={`flex-1 rounded-md px-2 py-1 text-center font-semibold ${props.filter.kind === k ? "bg-surface shadow-sm" : "text-muted hover:text-ink"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.push(href({ q: query.trim(), t: null }));
            }}
            className="flex-1"
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people and text" aria-label="Search conversations" className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm" />
          </form>
          <Link href={href({ status: props.filter.status === "open" ? "done" : "open", t: null })} className={buttonClass("ghost", "sm")}>
            {props.filter.status === "open" ? "Done" : "Open"}
          </Link>
        </div>
        {props.filter.kind === "message" ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            <b className="block text-ink">Direct messages aren’t connected yet</b>
            They need Meta’s messaging permissions (Instagram and Facebook Page messages), which Plotline’s Meta app doesn’t have yet. Comments work now.
          </div>
        ) : props.threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            <Icon name="comment" size={20} />
            {props.filter.status === "done" ? (
              "Nothing marked done yet."
            ) : props.connected ? (
              "No new comments. They come in with each sync, for posts from the last two weeks."
            ) : (
              <>
                <b className="text-ink">Connect your account to see comments</b>
                <span>Once Instagram or Facebook is connected, comments on recent posts appear here and you can reply.</span>
              </>
            )}
            {props.sampleMode && props.canEdit && props.filter.status === "open" && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await props.addSamples();
                    if (!r.ok) return void toast("error", "Couldn’t add samples", r.error);
                    toast(r.added ? "success" : "info", r.added ? `Added ${r.added} sample comments` : "No posts to comment on yet", r.added ? "Sample mode: replies stay in Plotline." : "Import some posts first.");
                  })
                }
                className={`${buttonClass("secondary", "sm")} mt-1`}
              >
                Add sample conversations
              </button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 overflow-y-auto">
            {props.threads.map((th) => (
              <li key={th.id}>
                <Link href={href({ t: th.id })} aria-current={t?.id === th.id ? "page" : undefined} className={`flex gap-2.5 rounded-xl px-2.5 py-2 ${t?.id === th.id ? "bg-select" : "hover:bg-subtle"}`}>
                  <PlatformLogo platform={th.platform} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <b className={`truncate text-sm ${th.unread ? "" : "font-medium"}`}>{th.participant}</b>
                      {th.sample && <span className="rounded bg-line-soft px-1 text-[10px] text-muted">sample</span>}
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(th.lastAt)}</span>
                    </span>
                    <span className={`line-clamp-1 text-[13px] ${th.unread ? "text-ink" : "text-muted"}`}>{th.preview}</span>
                  </span>
                  {th.unread && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {t ? (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
              <PlatformLogo platform={t.platform} size={22} />
              <span className="min-w-0 flex-1">
                <b className="block">{t.participant}</b>
                <span className="text-xs text-muted">
                  Comment{t.post ? ` on “${t.post.title}”` : ""}
                  {t.post?.permalink && (
                    <>
                      {" · "}
                      <a href={t.post.permalink} target="_blank" rel="noreferrer" className="underline">
                        View post
                      </a>
                    </>
                  )}
                </span>
              </span>
              {props.canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await props.setDone(t.id, !t.done);
                      if (!r.ok) return void toast("error", "That didn’t work", r.error);
                      router.push(href({ t: null }));
                    })
                  }
                  className={`${buttonClass("secondary", "sm")} gap-1.5`}
                >
                  <Icon name="check" size={14} /> {t.done ? "Reopen" : "Mark done"}
                </button>
              )}
            </header>
            <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              {t.messages.map((m) => (
                <li key={m.id} className={`flex max-w-[80%] flex-col gap-0.5 ${m.direction === "out" ? "self-end items-end" : ""}`}>
                  <span className="text-[11px] text-muted">
                    {m.author} · {ago(m.sentAt)}
                  </span>
                  <span className={`whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm ${m.direction === "out" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-subtle"}`}>{m.body}</span>
                </li>
              ))}
            </ol>
            {props.canReply ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const r = await props.reply(t.id, draft);
                    if (!r.ok) return void toast("error", "Couldn’t send the reply", r.error);
                    setDraft("");
                    if (r.sample) toast("info", "Saved in Plotline only", "This is a sample comment, so nothing was posted.");
                  });
                }}
                className="flex flex-col gap-2 border-t border-line p-3"
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  maxLength={2200}
                  placeholder={`Reply publicly to ${t.participant}…`}
                  aria-label="Reply"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
                />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Replies appear under the comment on {t.platform === "instagram" ? "Instagram" : "Facebook"}. Ctrl/⌘ Enter to send.</span>
                  <button type="submit" disabled={pending || !draft.trim()} className={buttonClass("primary", "sm")}>
                    {pending ? "Sending…" : "Reply"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="border-t border-line p-3 text-xs text-muted">Only people who can publish in this space can reply.</p>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted">
            <Icon name="comment" size={24} />
            <b className="text-ink">Select a conversation</b>
            <span className="text-sm">Comments on your posts, ready to answer without leaving Plotline.</span>
          </div>
        )}
      </section>
    </div>
  );
}
