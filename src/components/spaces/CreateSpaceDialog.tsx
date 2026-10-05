"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { SpaceResult } from "@/app/o/[org]/settings/spaces/actions";

export interface CreateSpaceOptions {
  colors: readonly string[];
  timezones: readonly string[];
  defaultTimezone: string;
  people: { id: string; name: string; email: string; role: string }[];
  templates: { key: string; label: string; description: string; count: number }[];
  spaces: { id: string; name: string; count: number }[];
  /** What another space adds to the bill (billing is per active space). */
  priceNote?: string | null;
}

/** SP-01: "Create your new social space". */
export function CreateSpaceDialog({ options, add, onClose }: { options: CreateSpaceOptions; add: (input: unknown) => Promise<SpaceResult<{ href: string }>>; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(options.colors[0]);
  const [timezone, setTimezone] = useState(options.defaultTimezone);
  const [members, setMembers] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState("template:agency");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [kind, value] = source.split(":");
  const statusCount = kind === "template" ? (options.templates.find((t) => t.key === value)?.count ?? 0) : (options.spaces.find((s) => s.id === value)?.count ?? 0);
  const shown = options.people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(filter.trim().toLowerCase()));

  const submit = (open: boolean) =>
    start(async () => {
      const r = await add({ name, color, timezone, memberIds: members, statuses: kind === "template" ? { template: value } : { copyFrom: value } });
      if (!r.ok) return setError(r.error);
      onClose();
      if (open) router.push(r.href);
      else router.refresh();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label="Close" className="fixed inset-0 cursor-default" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Create your new social space"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) submit(true);
        }}
        className="relative flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-surface p-5 shadow-2xl"
      >
        <h2 className="font-display text-xl font-bold">Create your new social space</h2>
        <div className="flex items-end gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl text-xl font-bold" style={{ background: color }}>
            {name.trim()[0]?.toUpperCase() ?? "?"}
          </span>
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
            Name
            <input autoFocus required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cafe Delhi, Sharma Jewellers" className="h-10 rounded-lg border border-line px-3 font-normal" />
          </label>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {options.colors.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="space-color" checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
                <span aria-label={c} className="block size-7 rounded-lg ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-focus" style={{ background: c }} />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Time zone
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-10 rounded-lg border border-line bg-surface px-2 font-normal">
            {options.timezones.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-semibold">Members</legend>
          <p className="text-xs text-muted">Owners and Admins are in every space. Add the Managers and Editors who’ll work here.</p>
          {options.people.length === 0 ? (
            <p className="text-sm text-muted">No Managers or Editors yet. Invite people from Members.</p>
          ) : (
            <>
              {options.people.length > 6 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-8 rounded-lg border border-line px-2 text-sm" />}
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-line-soft">
                {shown.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-subtle">
                      <input type="checkbox" checked={members.includes(p.id)} onChange={(e) => setMembers(e.target.checked ? [...members, p.id] : members.filter((m) => m !== p.id))} />
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs capitalize text-muted">{p.role}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Statuses
          <select value={source} onChange={(e) => setSource(e.target.value)} className="h-10 rounded-lg border border-line bg-surface px-2 font-normal">
            <optgroup label="Template">
              {options.templates.map((t) => (
                <option key={t.key} value={`template:${t.key}`}>
                  {t.label}: {t.description}
                </option>
              ))}
            </optgroup>
            {options.spaces.length > 0 && (
              <optgroup label="Copy from a space">
                {options.spaces.map((s) => (
                  <option key={s.id} value={`space:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="text-xs font-normal text-muted">You can add your own statuses in the space’s settings afterwards.</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
          <span className="text-sm text-muted">
            {members.length} member{members.length === 1 ? "" : "s"}, {statusCount} statuses
            {options.priceNote && <span className="block text-xs">{options.priceNote}</span>}
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass("ghost")}>
              Cancel
            </button>
            <button type="button" disabled={pending || name.trim().length < 2} onClick={() => submit(false)} className={buttonClass("secondary")}>
              Create only
            </button>
            <button type="submit" disabled={pending || name.trim().length < 2} className={buttonClass("primary")}>
              {pending ? "Creating…" : "Create and open"}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}
