"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import type { Segment } from "@/lib/ai/claims";
import { REASONING, type ReasoningLevel } from "@/lib/ai/config";
import type { ActionView, TurnView } from "@/server/ai/view";
import { ActionCard } from "./ActionCard";

const LABEL = {
  data: ["Your data", "bg-data-bg text-data"],
  ai: ["AI suggestion", "bg-ai-bg text-ai"],
  unverified: ["Check this", "bg-warn-bg text-warn-ink"],
} as const;

/** Answer text with its source labels (AI-07). */
export function ClaimText({ segments }: { segments: Segment[] }) {
  return (
    <p className="whitespace-pre-line text-[15px] leading-relaxed">
      {segments.map((s, i) => (
        <span key={i}>
          {s.text}
          {s.label && (
            <span
              title={s.label === "unverified" ? "A number here isn't in your computed data. Treat it with care." : undefined}
              className={`ml-1.5 inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ${LABEL[s.label][1]}`}
            >
              {LABEL[s.label][0]}
            </span>
          )}
        </span>
      ))}
    </p>
  );
}

/** Labels while streaming, before the server has checked the numbers. */
function liveSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\s*\[(Your data|AI suggestion)\]/g)) {
    out.push({ text: text.slice(last, m.index), label: m[1] === "Your data" ? "data" : "ai" });
    last = m.index! + m[0].length;
  }
  out.push({ text: text.slice(last) });
  return out;
}

function Spark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      </svg>
    </span>
  );
}

interface Live {
  user: string;
  text: string;
  tools: { id: string; name: string; status: string }[];
  error?: string;
}

const TOOL_LABEL: Record<string, string> = {
  list_spaces: "Looking at your spaces",
  get_space_snapshot: "Checking the board",
  get_analytics: "Reading analytics",
  get_audit: "Reading the audit",
  list_posts: "Reading posts",
  get_brand_brain: "Reading Brand Brain",
  propose_draft_posts: "Preparing draft posts",
  propose_captions: "Preparing captions",
  propose_ideas: "Collecting ideas",
};

export function Chat({
  org,
  conversationId,
  turns,
  scopes,
  initialScope,
  templates,
  aiReady,
  credits,
  approve,
  dismiss,
  undo,
  initialPrompt = "",
}: {
  /** A message filled in for the person to send, e.g. from Notifications › Summarize. */
  initialPrompt?: string;
  org: string;
  conversationId: string | null;
  turns: TurnView[];
  /** Offered only for a new conversation; an existing one keeps its scope. */
  scopes: { value: string; label: string }[] | null;
  initialScope: string;
  templates: string[];
  aiReady: boolean;
  credits: { used: number; budget: number };
  approve: (actionId: string, payload: unknown) => Promise<void>;
  dismiss: (actionId: string) => Promise<void>;
  undo: (actionId: string) => Promise<{ kept: number }>;
}) {
  const router = useRouter();
  const [input, setInput] = useState(initialPrompt);
  const [scope, setScope] = useState(initialScope);
  const [reasoning, setReasoning] = useState<ReasoningLevel>("balanced");
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, live?.text, live?.tools.length]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    setLive({ user: message, text: "", tools: [] });
    let id = conversationId;
    try {
      const res = await fetch(`/api/o/${org}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, space: scope === "org" ? undefined : scope, message, reasoning }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setLive((l) => l && { ...l, error: body.error ?? "Something went wrong. Try again." });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line);
          if (e.type === "conversation") id = e.id;
          if (e.type === "text") setLive((l) => l && { ...l, text: l.text + e.text });
          if (e.type === "tool")
            setLive((l) => l && { ...l, tools: [...l.tools.filter((t) => t.id !== e.id), { id: e.id, name: e.name, status: e.status }] });
          if (e.type === "error" || e.type === "refusal") setLive((l) => l && { ...l, error: e.message });
        }
      }
    } catch {
      setLive((l) => l && { ...l, error: "The connection dropped. Your message was saved; reload to see the answer so far." });
    } finally {
      setBusy(false);
      if (id && id !== conversationId) router.push(`/o/${org}/ai/c/${id}`);
      else router.refresh();
      // The saved, checked version replaces the live one once the page refreshes.
      setTimeout(() => setLive((l) => (l?.error ? l : null)), 400);
    }
  }

  const empty = turns.length === 0 && !live;
  const over = credits.used >= credits.budget;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3 text-sm">
        {scopes ? (
          <label className="flex items-center gap-2">
            <span className="text-muted">Scope</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 font-semibold">
              {scopes.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-muted">
            Scope: <strong className="text-ink">{initialScope}</strong>
          </span>
        )}
        <span className="flex items-center gap-2 text-[13px] text-muted">
          Credits this month: <strong className="text-ink">{credits.used.toLocaleString("en-IN")}</strong> of {credits.budget.toLocaleString("en-IN")}
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line" aria-hidden>
            <span className={`block h-full ${over ? "bg-danger" : "bg-ink"}`} style={{ width: `${Math.min(100, (credits.used / Math.max(1, credits.budget)) * 100)}%` }} />
          </span>
        </span>
      </div>

      <div className="flex-1 px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {!aiReady && (
            <p role="alert" className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
              AI isn’t set up yet. Add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart the app.
            </p>
          )}
          {empty && (
            <div className="flex flex-col gap-4 pt-8">
              <h1 className="font-display text-3xl font-bold">What should we work on?</h1>
              <p className="text-muted">Ask about performance, plan posts or rewrite captions. Every number comes from your data, and nothing changes until you approve it.</p>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button key={t} type="button" disabled={!aiReady || busy} onClick={() => send(t)} className="rounded-full border border-line bg-surface px-3 py-2 text-left text-sm hover:border-ink-2">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, i) =>
            turn.kind === "user" ? (
              <div key={i} className="self-end max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[15px] text-white">
                {turn.text}
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <Spark />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  {turn.parts.map((p, j) =>
                    p.type === "text" ? (
                      <ClaimText key={j} segments={p.segments} />
                    ) : p.type === "tool" ? (
                      <span key={j} className="self-start rounded-full bg-ground px-2.5 py-1 text-xs text-muted">
                        ✓ {p.label}
                      </span>
                    ) : (
                      <ActionCard
                        key={j}
                        org={org}
                        action={p.action as ActionView}
                        approve={(payload) => approve(p.action.id, payload)}
                        dismiss={() => dismiss(p.action.id)}
                        undo={() => undo(p.action.id)}
                      />
                    ),
                  )}
                </div>
              </div>
            ),
          )}

          {live && (
            <>
              <div className="self-end max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[15px] text-white">{live.user}</div>
              <div className="flex gap-3">
                <Spark />
                <div className="flex min-w-0 flex-1 flex-col gap-3" aria-live="polite">
                  {live.tools.map((t) => (
                    <span key={t.id} className="self-start rounded-full bg-ground px-2.5 py-1 text-xs text-muted">
                      {t.status === "running" ? "…" : t.status === "error" ? "!" : "✓"} {TOOL_LABEL[t.name] ?? t.name}
                    </span>
                  ))}
                  {live.text ? <ClaimText segments={liveSegments(live.text)} /> : !live.error && <span className="text-sm text-muted">Thinking…</span>}
                  {live.error && (
                    <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
                      {live.error}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 border-t border-line bg-ground/95 px-6 py-4 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sm">
          <label htmlFor="copilot-input" className="sr-only">
            Message AI Copilot
          </label>
          <textarea
            autoFocus={Boolean(initialPrompt)}
            id="copilot-input"
            rows={2}
            value={input}
            disabled={!aiReady}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={aiReady ? "Ask about a space, plan posts, or rewrite captions…" : "AI isn’t set up yet"}
            className="resize-none bg-transparent text-[15px] outline-none"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Reasoning
              <select
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value as ReasoningLevel)}
                className="h-8 rounded-lg border border-line bg-subtle px-2 text-[13px] font-semibold text-ink"
              >
                {(Object.keys(REASONING) as ReasoningLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {REASONING[k].label}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex-1" />
            <button type="submit" disabled={!aiReady || busy || !input.trim() || over} className={buttonClass("primary", "sm")}>
              {busy ? "Working…" : "Send"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
