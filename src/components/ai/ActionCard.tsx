"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PlacementChip, buttonClass } from "@/components/ui";
import type { PlacementKind } from "@/lib/placements";
import type { ActionView } from "@/server/ai/view";

interface IdeaRow {
  title: string;
  notes?: string;
  pillar?: string;
  source?: "ai" | "trend" | "competitor";
  tags?: string[];
}

interface DraftRow {
  date: string;
  time: string;
  title: string;
  placements: PlacementKind[];
  pillar?: string;
  caption?: string;
}

function day(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** An action card (AI-05): edit, then approve or dismiss. Nothing changes until approved. */
export function ActionCard({
  org,
  action,
  approve,
  dismiss,
  undo,
}: {
  org: string;
  action: ActionView;
  approve: (payload: unknown) => Promise<void>;
  dismiss: () => Promise<void>;
  undo: () => Promise<{ kept: number }>;
}) {
  const payload = action.payload as {
    summary?: string;
    posts?: DraftRow[];
    changes?: { post_id: string; caption: string; hashtags?: string }[];
    ideas?: IdeaRow[];
  };
  const [posts, setPosts] = useState<DraftRow[]>(payload.posts ?? []);
  const [ideas, setIdeas] = useState<IdeaRow[]>(payload.ideas ?? []);
  const [changes, setChanges] = useState(payload.changes ?? []);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      try {
        setMessage(null);
        await fn();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      }
    });

  const isDrafts = action.tool === "propose_draft_posts";
  const isIdeas = action.tool === "propose_ideas";
  const count = isDrafts ? posts.length : isIdeas ? ideas.length : changes.length;
  const title = isDrafts
    ? `Create ${count} draft post${count === 1 ? "" : "s"} in ${action.spaceName}`
    : isIdeas
      ? `Add ${count} idea${count === 1 ? "" : "s"} to ${action.spaceName}’s Idea Bank`
      : `Update ${count} caption${count === 1 ? "" : "s"} in ${action.spaceName}`;
  const board = `/o/${org}/s/${action.spaceSlug}/board`;
  const proposed = action.state === "proposed";

  return (
    <section aria-label="Proposed action" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(23,24,28,0.06)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft bg-subtle px-4 py-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{proposed ? "Proposed action" : "Action"}</span>
          <strong className="text-[15px]">{title}</strong>
        </span>
        {payload.summary && <span className="text-xs text-muted">{payload.summary}</span>}
      </header>

      {isIdeas ? (
        <ul className="divide-y divide-line-soft">
          {ideas.map((idea, i) => (
            <li key={i} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {editing && proposed ? (
                  <input
                    aria-label={`Idea ${i + 1}`}
                    value={idea.title}
                    onChange={(e) => setIdeas(ideas.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className="h-9 min-w-[200px] flex-1 rounded-lg border border-line px-2 text-sm"
                  />
                ) : (
                  <span className="min-w-[200px] flex-1 text-sm font-medium">{idea.title}</span>
                )}
                {idea.pillar && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold">{idea.pillar}</span>}
                {idea.source && idea.source !== "ai" && <span className="text-xs text-muted">{idea.source === "trend" ? "Trend" : "Competitor"}</span>}
                {editing && proposed && (
                  <button type="button" onClick={() => setIdeas(ideas.filter((_, j) => j !== i))} className={buttonClass("ghost", "sm")}>
                    Remove
                  </button>
                )}
              </div>
              {idea.notes && <p className="line-clamp-2 text-[13px] text-ink-2">{idea.notes}</p>}
            </li>
          ))}
        </ul>
      ) : isDrafts ? (
        <ul className="divide-y divide-line-soft">
          {posts.map((p, i) => (
            <li key={i} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-[120px] shrink-0 text-[13px] font-semibold">
                  {day(p.date)}, {p.time}
                </span>
                <span className="flex flex-wrap gap-1">
                  {p.placements.map((k) => (
                    <PlacementChip key={k} kind={k} />
                  ))}
                </span>
                {editing && proposed ? (
                  <input
                    aria-label={`Title for ${day(p.date)}`}
                    value={p.title}
                    onChange={(e) => setPosts(posts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className="h-9 min-w-[200px] flex-1 rounded-lg border border-line px-2 text-sm"
                  />
                ) : (
                  <span className="min-w-[200px] flex-1 text-sm font-medium">{p.title}</span>
                )}
                {p.pillar && <span className="text-xs text-muted">{p.pillar}</span>}
                {editing && proposed && (
                  <button type="button" onClick={() => setPosts(posts.filter((_, j) => j !== i))} className={buttonClass("ghost", "sm")}>
                    Remove
                  </button>
                )}
              </div>
              {p.caption &&
                (editing && proposed ? (
                  <textarea
                    aria-label={`Caption for ${p.title}`}
                    value={p.caption}
                    rows={3}
                    onChange={(e) => setPosts(posts.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                    className="rounded-lg border border-line p-2 text-sm"
                  />
                ) : (
                  <p className="line-clamp-2 whitespace-pre-line text-[13px] text-ink-2">{p.caption}</p>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line-soft">
          {changes.map((c, i) => {
            const post = action.posts.find((p) => p.id === c.post_id);
            return (
              <li key={c.post_id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <strong>{post?.title ?? "A post"}</strong>
                {post?.caption && action.state === "proposed" && <p className="text-[13px] text-muted line-through">{post.caption}</p>}
                {editing && proposed ? (
                  <textarea
                    aria-label={`New caption for ${post?.title ?? "post"}`}
                    value={c.caption}
                    rows={4}
                    onChange={(e) => setChanges(changes.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                    className="rounded-lg border border-line p-2"
                  />
                ) : (
                  <p className="whitespace-pre-line text-ink-2">{c.caption}</p>
                )}
                {c.hashtags && <p className="text-data">{c.hashtags}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3">
        {proposed ? (
          <>
            <button
              type="button"
              disabled={pending || count === 0}
              onClick={() => run(() => approve({ ...payload, ...(isDrafts ? { posts } : isIdeas ? { ideas } : { changes }) }))}
              className={buttonClass("primary")}
            >
              {pending ? "Applying…" : "Approve and add"}
            </button>
            <button type="button" onClick={() => setEditing(!editing)} className={buttonClass("secondary")}>
              {editing ? "Done editing" : "Edit"}
            </button>
            <button type="button" disabled={pending} onClick={() => run(dismiss)} className={buttonClass("ghost")}>
              Dismiss
            </button>
            <span className="ml-auto text-xs text-muted">Nothing changes until you approve.</span>
          </>
        ) : action.state === "executed" ? (
          <>
            <span className="text-sm font-semibold text-success-ink">
              {isDrafts
                ? `${(action.result?.contentIds as string[] | undefined)?.length ?? count} drafts added under “Idea”. Logged as “by AI Copilot”.`
                : isIdeas
                  ? `${(action.result?.ideaIds as string[] | undefined)?.length ?? count} ideas added to the Idea Bank.`
                  : "Captions updated. Logged as “by AI Copilot”."}
            </span>
            <Link href={isIdeas ? `/o/${org}/s/${action.spaceSlug}/ideas` : board} className={buttonClass("secondary", "sm")}>
              {isIdeas ? "Open the Idea Bank" : "Open the Board"}
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const { kept } = await undo();
                  if (kept) setMessage(`Undone. ${kept} item${kept === 1 ? " was" : "s were"} kept because someone changed ${kept === 1 ? "it" : "them"} since.`);
                })
              }
              className={buttonClass("ghost", "sm")}
            >
              Undo
            </button>
          </>
        ) : (
          <span className="text-sm text-muted">{action.state === "dismissed" ? "Dismissed. Nothing was changed." : action.state === "undone" ? "Undone." : "This action failed."}</span>
        )}
      </footer>
      {message && (
        <p role="status" className="border-t border-line-soft px-4 py-2 text-xs text-ink-2">
          {message}
        </p>
      )}
    </section>
  );
}
