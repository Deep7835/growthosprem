"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";

const MODES = [
  ["write", "Write"],
  ["improve", "Improve"],
  ["shorten", "Shorten"],
  ["hinglish", "Make it Hinglish"],
  ["hindi", "Hindi"],
  ["hooks", "Suggest hooks"],
  ["hashtags", "Hashtags"],
] as const;

/** Inline AI on the caption (CT-08): suggestions to insert or replace, never silent overwrites. */
export function CaptionAssist({
  caption,
  assist,
  setCaption,
  setHashtags,
}: {
  caption: string;
  assist: (mode: string) => Promise<{ text?: string; error?: string }>;
  setCaption: (value: string) => Promise<void>;
  setHashtags: (value: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = (m: string) =>
    startTransition(async () => {
      setMode(m);
      setSuggestion(null);
      setError(null);
      const r = await assist(m);
      if (r.error) setError(r.error);
      else setSuggestion(r.text ?? "");
    });
  const apply = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      setSuggestion(null);
      setMode(null);
    });

  return (
    <div className="flex flex-col gap-2 px-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="AI caption help">
        {MODES.map(([m, label]) => (
          <button key={m} type="button" disabled={pending} onClick={() => ask(m)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 hover:border-ink-2 disabled:opacity-50">
            {pending && mode === m ? "…" : label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {suggestion !== null && mode && (
        <div className="flex flex-col gap-2 rounded-xl border border-ai/30 bg-ai-bg/60 p-3 text-sm">
          <span className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-ai-bg px-2 py-0.5 text-[11px] font-semibold text-ai">AI suggestion</span>
            <button type="button" onClick={() => setSuggestion(null)} className="text-xs text-muted underline">
              Dismiss
            </button>
          </span>
          {mode === "hooks" ? (
            <ul className="flex flex-col gap-1">
              {suggestion
                .split("\n")
                .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
                .filter(Boolean)
                .map((hook) => (
                  <li key={hook} className="flex items-start justify-between gap-2">
                    <span>{hook}</span>
                    <button type="button" disabled={pending} onClick={() => apply(() => setCaption(`${hook}\n\n${caption}`.trim()))} className={buttonClass("secondary", "sm")}>
                      Use as opening
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <>
              <p className="whitespace-pre-line text-ink">{suggestion}</p>
              <span className="flex flex-wrap gap-2">
                {mode === "hashtags" ? (
                  <button type="button" disabled={pending} onClick={() => apply(() => setHashtags(suggestion))} className={buttonClass("primary", "sm")}>
                    Use these hashtags
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={pending} onClick={() => apply(() => setCaption(suggestion))} className={buttonClass("primary", "sm")}>
                      Replace caption
                    </button>
                    <button type="button" disabled={pending} onClick={() => apply(() => setCaption(`${caption}\n\n${suggestion}`.trim()))} className={buttonClass("secondary", "sm")}>
                      Insert below
                    </button>
                  </>
                )}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
