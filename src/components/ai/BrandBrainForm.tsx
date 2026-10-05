"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";

export type BrainFields = {
  website: string;
  description: string;
  audience: string;
  voice: string;
  dos: string;
  donts: string;
  offers: string;
  usps: string;
  faqs: string;
  competitors: string;
  captionLanguage: "en" | "hi" | "hinglish";
};

const FIELDS: { key: keyof BrainFields; label: string; hint: string; rows?: number }[] = [
  { key: "description", label: "What the brand is", hint: "What you sell, where, and what makes you you.", rows: 3 },
  { key: "audience", label: "Audience", hint: "Who you're talking to: age, city, habits, why they come to you." },
  { key: "voice", label: "Voice and tone", hint: "For example: warm, witty, never formal. Uses Hinglish for fun posts." },
  { key: "dos", label: "Always", hint: "One per line. For example: mention free Wi-Fi in work-from-cafe posts." },
  { key: "donts", label: "Never", hint: "One per line. For example: no emojis, never compare prices with competitors." },
  { key: "offers", label: "Current offers", hint: "Running offers and their dates." },
  { key: "usps", label: "What makes you different", hint: "One per line." },
  { key: "faqs", label: "Questions customers ask", hint: "One per line, with the answer." },
  { key: "competitors", label: "Competitors", hint: "Names or handles, one per line." },
];

const COPY_PROMPT = `Describe my brand for a social media team. Cover: what we are and sell, our audience, our voice and tone, things we always do, things we never do, current offers, what makes us different, common customer questions with answers, and our competitors. Keep each part short.`;

/** Brand Brain (AI-10): quick start from a website or a pasted answer, then review and save. */
export function BrandBrainForm({
  initial,
  canEdit,
  save,
  draft,
}: {
  initial: BrainFields;
  canEdit: boolean;
  save: (fields: BrainFields) => Promise<void>;
  draft: (source: { website: string } | { text: string }) => Promise<{ draft?: Omit<BrainFields, "website">; error?: string }>;
}) {
  const [fields, setFields] = useState(initial);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const filled = FIELDS.filter((f) => fields[f.key].trim()).length + (fields.website.trim() ? 1 : 0);
  const total = FIELDS.length + 1;

  const set = (key: keyof BrainFields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const applyDraft = (source: { website: string } | { text: string }) =>
    startTransition(async () => {
      setStatus({ kind: "info", text: "website" in source ? "Reading the website… this can take up to a minute." : "Reading your answer…" });
      const r = await draft(source);
      if (r.error || !r.draft) return setStatus({ kind: "error", text: r.error ?? "Couldn’t draft Brand Brain." });
      // Fill only empty fields, so nothing the team wrote is overwritten.
      setFields((f) => {
        const next = { ...f };
        for (const [k, v] of Object.entries(r.draft!)) {
          const key = k as keyof BrainFields;
          if (key === "captionLanguage") next.captionLanguage = v as BrainFields["captionLanguage"];
          else if (!String(next[key]).trim() && v) (next[key] as string) = v as string;
        }
        return next;
      });
      setDirty(true);
      setStatus({ kind: "ok", text: "Draft filled in the empty fields. Review it, then save." });
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <strong>
            {filled} of {total} filled in
          </strong>
          <span className="text-muted">{filled === total ? "Complete. The AI knows this brand well." : "The more you fill in, the better the AI writes."}</span>
        </div>
        <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden>
          <span className="block h-full bg-success" style={{ width: `${(filled / total) * 100}%` }} />
        </span>
      </div>

      {canEdit && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">Quick start from your website</h2>
            <input
              aria-label="Website"
              value={fields.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="cafe.example.in"
              className="h-10 rounded-lg border border-line px-3 text-sm"
            />
            <button type="button" disabled={pending || !fields.website.trim()} onClick={() => applyDraft({ website: fields.website })} className={buttonClass("primary")}>
              Draft from website
            </button>
          </section>
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">Already using ChatGPT or Claude?</h2>
            <p className="text-sm text-muted">Copy this prompt into the assistant that knows your brand, then paste the answer here.</p>
            <button type="button" onClick={() => navigator.clipboard.writeText(COPY_PROMPT).then(() => setStatus({ kind: "info", text: "Prompt copied." }))} className={buttonClass("secondary", "sm")}>
              Copy the prompt
            </button>
            <textarea aria-label="Paste the answer" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the answer here" className="rounded-lg border border-line p-2 text-sm" />
            <button type="button" disabled={pending || pasted.trim().length < 40} onClick={() => applyDraft({ text: pasted })} className={buttonClass("secondary")}>
              Fill from this answer
            </button>
          </section>
        </div>
      )}

      {status && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${status.kind === "error" ? "bg-danger-bg text-danger" : status.kind === "ok" ? "bg-success-bg text-success-ink" : "bg-subtle text-ink-2"}`}>
          {status.text}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            try {
              await save(fields);
              setDirty(false);
              setStatus({ kind: "ok", text: "Brand Brain saved. The AI uses it from the next message." });
            } catch (err) {
              setStatus({ kind: "error", text: err instanceof Error ? err.message : "Couldn’t save." });
            }
          });
        }}
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
      >
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5 text-sm font-semibold">
            {f.label}
            <span className="text-xs font-normal text-muted">{f.hint}</span>
            <textarea
              rows={f.rows ?? 2}
              value={fields[f.key]}
              readOnly={!canEdit}
              onChange={(e) => set(f.key, e.target.value)}
              className="rounded-lg border border-line p-2.5 text-[15px] font-normal"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Caption language
          <select
            value={fields.captionLanguage}
            disabled={!canEdit}
            onChange={(e) => set("captionLanguage", e.target.value)}
            className="h-10 w-60 rounded-lg border border-line bg-surface px-2 font-normal"
          >
            <option value="en">English</option>
            <option value="hinglish">Hinglish</option>
            <option value="hi">Hindi (Devanagari)</option>
          </select>
        </label>
        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
            <button type="submit" disabled={pending} className={`${buttonClass("primary")} h-11`}>
              Save Brand Brain
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
