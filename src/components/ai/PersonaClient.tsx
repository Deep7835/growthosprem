"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { buttonClass } from "@/components/ui";
import type { ToolResult } from "@/app/o/[org]/ai/tools-actions";

type Persona = { role: string; about: string; voice: string; avoid: string; website: string };
const EMPTY: Persona = { role: "", about: "", voice: "", avoid: "", website: "" };

const ASK_ELSEWHERE = `You know my work, brand and how I communicate. Write a short persona profile I can paste into Plotline, my social media workspace, so its AI writes like me. Use these headings: Role (one line), About me and my work (3 to 5 sentences), How I like to write (tone, words I use, length, emoji, languages such as English, Hindi or Hinglish), Avoid (things I never want in my posts). Keep it under 250 words.`;

/** AI › Your persona: how you write and work, given to AI Copilot in your conversations only. */
export function PersonaClient({ initial, save, remove }: { initial: Persona | null; save: (p: Persona) => Promise<ToolResult>; remove: () => Promise<ToolResult> }) {
  const [p, setP] = useState<Persona>(initial ?? EMPTY);
  const [pasted, setPasted] = useState("");
  const [pending, start] = useTransition();
  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";
  const row = (key: keyof Persona, label: string, hint: string, rows = 3) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <span className="text-xs font-normal text-muted">{hint}</span>
      {rows === 1 ? (
        <input value={p[key]} onChange={(e) => setP({ ...p, [key]: e.target.value })} className={`${field} h-10`} />
      ) : (
        <textarea value={p[key]} onChange={(e) => setP({ ...p, [key]: e.target.value })} rows={rows} className={field} />
      )}
    </label>
  );
  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6 pb-14 lg:grid-cols-[1.2fr_1fr]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await save(p);
            if (r.ok) toast("success", "Persona saved", "AI Copilot uses it in your new messages.");
            else toast("error", "Couldn’t save your persona", r.error);
          });
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <h1 className="text-xl font-semibold">Your persona</h1>
          <p className="text-sm text-muted">Tell AI Copilot how you work and write. It uses this in your conversations only; each client’s Brand Brain still sets that brand’s voice.</p>
        </div>
        {row("role", "Your role", "For example: Social media manager at a Delhi agency for restaurants and cafés.", 1)}
        {row("about", "About you and your work", "Your clients, your goals, how you like to plan.", 4)}
        {row("voice", "How you like to write", "Tone, length, emoji, languages (English, Hindi, Hinglish), phrases you use.", 3)}
        {row("avoid", "Avoid", "Words, styles or topics you never want.", 2)}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Website <span className="text-xs font-normal text-muted">(optional)</span>
          <input value={p.website} onChange={(e) => setP({ ...p, website: e.target.value })} placeholder="https://yourwebsite.com" className={`${field} h-10`} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={`${buttonClass("primary")} h-10 px-5`}>
            {pending ? "Saving…" : "Save persona"}
          </button>
          {initial && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await remove();
                  if (r.ok) {
                    setP(EMPTY);
                    toast("success", "Persona deleted");
                  } else toast("error", "Couldn’t delete it", r.error);
                })
              }
              className={`${buttonClass("ghost")} h-10 text-danger`}
            >
              <Icon name="trash" size={15} /> Delete
            </button>
          )}
        </div>
      </form>

      <aside className="flex flex-col gap-4 self-start rounded-2xl border border-line bg-subtle p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-accent-bg text-accent-ink">
            <Icon name="sparkles" />
          </span>
          <b>Help AI Copilot get to know you</b>
        </div>
        <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
          <li>• Drafts that sound like you</li>
          <li>• Plans that fit how you work</li>
          <li>• Less editing before you share</li>
        </ul>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <b className="text-sm">Already use Claude or ChatGPT?</b>
          <p className="text-[13px] text-muted">Copy this prompt there, then paste the answer below.</p>
          <p className="max-h-32 overflow-y-auto rounded-lg bg-surface p-2.5 text-xs text-ink-2">{ASK_ELSEWHERE}</p>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(ASK_ELSEWHERE);
              toast("success", "Prompt copied");
            }}
            className={`${buttonClass("secondary", "sm")} self-start`}
          >
            Copy prompt
          </button>
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} placeholder="Paste the answer here" aria-label="Pasted persona" className={`${field} mt-1`} />
          <button
            type="button"
            disabled={!pasted.trim()}
            onClick={() => {
              setP({ ...p, about: pasted.trim().slice(0, 3000) });
              setPasted("");
              toast("info", "Added to “About you”", "Check it, then save.");
            }}
            className={`${buttonClass("secondary", "sm")} self-start`}
          >
            Use this answer
          </button>
        </div>
      </aside>
    </div>
  );
}
