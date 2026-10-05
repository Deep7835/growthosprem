"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

/** Large modal over the current view with its own URL (?content=id). Esc closes (CT-14). */
export function PanelFrame({ closeHref, title, children }: { closeHref: string; title: string; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 md:p-8">
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 cursor-default"
        onClick={() => router.push(closeHref, { scroll: false })}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[1440px] rounded-2xl bg-surface shadow-2xl md:w-[92vw]"
      >
        {children}
      </div>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Autosaving field with a "Saved" indicator (CT-13). */
export function InlineField({
  label,
  initial,
  save,
  multiline = false,
  readOnly = false,
  placeholder,
  className = "",
  counter,
}: {
  label: string;
  initial: string;
  save: (value: string) => Promise<void>;
  multiline?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  counter?: { label: string; limit: number }[];
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const last = useRef(initial);
  const [, startTransition] = useTransition();

  function commit() {
    if (readOnly || value === last.current) return;
    setState("saving");
    startTransition(async () => {
      try {
        await save(value);
        last.current = value;
        setState("saved");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
        setState("error");
      }
    });
  }

  const shared = {
    "aria-label": label,
    value,
    readOnly,
    placeholder,
    onChange: (e: { target: { value: string } }) => {
      setValue(e.target.value);
      setState("idle");
    },
    onBlur: commit,
    className: `w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-line focus:border-ink-2 ${className}`,
  };

  return (
    <div className="flex flex-col gap-1">
      {multiline ? <textarea rows={5} {...shared} /> : <input type="text" {...shared} />}
      <div className="flex min-h-4 items-center justify-between gap-2 px-2 text-xs">
        <span className="flex gap-3 text-muted">
          {counter?.map((c) => (
            <span key={c.label} className={value.length > c.limit ? "font-semibold text-danger" : ""}>
              {c.label} {value.length.toLocaleString("en-IN")} / {c.limit.toLocaleString("en-IN")}
            </span>
          ))}
        </span>
        <span aria-live="polite" className={state === "error" ? "text-danger" : "text-muted"}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? error : ""}
        </span>
      </div>
    </div>
  );
}

export function StatusSelect({
  statuses,
  current,
  disabled,
  move,
}: {
  statuses: { id: string; name: string; category: string }[];
  current: string;
  disabled: boolean;
  move: (statusId: string) => Promise<void>;
}) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const groups = ["not_started", "active", "completed", "closed"] as const;
  const groupLabel = { not_started: "Not started", active: "Active", completed: "Completed", closed: "Closed" };
  return (
    <select
      aria-label="Status"
      value={value}
      disabled={disabled || pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        startTransition(() => move(next));
      }}
      className="h-9 rounded-lg border border-line bg-surface px-2 text-sm font-semibold"
    >
      {groups.map((g) => (
        <optgroup key={g} label={groupLabel[g]}>
          {statuses
            .filter((s) => s.category === g)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function ActivityTabs({ privateTab, publicTab, aiTab }: { privateTab: ReactNode; publicTab: ReactNode; aiTab: ReactNode }) {
  const [tab, setTab] = useState<"private" | "public" | "ai">("private");
  const tabs = [
    ["private", "Private"],
    ["public", "Public"],
    ["ai", "AI"],
  ] as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Activity" className="flex gap-1 border-b border-line px-4">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? "border-ink text-ink" : "border-transparent text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === "private" ? privateTab : tab === "public" ? publicTab : aiTab}
      </div>
    </div>
  );
}
