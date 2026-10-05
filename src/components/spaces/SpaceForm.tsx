"use client";

import { useState, useTransition } from "react";
import type { Platform } from "@/lib/placements";

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
];

type Patch = { name?: string; color?: string; timezone?: string; platformColors?: Record<string, string>; hiddenPlatforms?: string[] };

/** SP-03: name and avatar, time zone, a colour per platform for calendars, and platforms to hide. */
export function SpaceForm(props: {
  canEdit: boolean;
  name: string;
  color: string;
  timezone: string;
  colors: readonly string[];
  timezones: readonly string[];
  platformColors: Record<Platform, string>;
  defaultColors: Record<Platform, string>;
  palette: string[];
  hidden: Platform[];
  save: (patch: Patch) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [name, setName] = useState(props.name);
  const [color, setColor] = useState(props.color);
  const [platformColors, setPlatformColors] = useState(props.platformColors);
  const [hidden, setHidden] = useState(props.hidden);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const save = (patch: Patch, done = "Saved.") =>
    start(async () => {
      const r = await props.save(patch);
      setStatus(r.ok ? { text: done } : { text: r.error, error: true });
    });
  const field = "h-10 rounded-lg border border-line bg-surface px-3 text-sm";

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className={`min-h-5 text-sm ${status?.error ? "text-danger" : "text-muted"}`}>
        {pending ? "Saving…" : status?.text}
      </p>
      <section aria-labelledby="space-identity" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <h2 id="space-identity" className="font-semibold">
          Name and avatar
        </h2>
        <div className="flex items-end gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl text-xl font-bold" style={{ background: color }}>
            {name.trim()[0]?.toUpperCase() ?? "?"}
          </span>
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
            Name
            <input value={name} disabled={!props.canEdit} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== props.name && name.trim().length >= 2 && save({ name })} className={`${field} font-normal`} />
          </label>
        </div>
        <fieldset className="flex flex-col gap-1.5" disabled={!props.canEdit}>
          <legend className="mb-1 text-sm font-semibold">Avatar colour</legend>
          <div className="flex flex-wrap gap-2">
            {props.colors.map((c) => (
              <label key={c} className="cursor-pointer">
                <input
                  type="radio"
                  name="avatar"
                  checked={color === c}
                  onChange={() => {
                    setColor(c);
                    save({ color: c });
                  }}
                  className="peer sr-only"
                />
                <span aria-label={c} className="block size-7 rounded-lg ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-focus" style={{ background: c }} />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
          Time zone
          <select defaultValue={props.timezone} disabled={!props.canEdit} onChange={(e) => save({ timezone: e.target.value }, "Time zone saved. Schedules keep their exact moment; times show in the new zone.")} className={`${field} font-normal`}>
            {props.timezones.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section aria-labelledby="space-platforms" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
        <div>
          <h2 id="space-platforms" className="font-semibold">
            Platforms
          </h2>
          <p className="text-sm text-muted">The colour each platform has on this space’s calendar, and which platforms to offer when adding them to a post.</p>
        </div>
        <ul className="flex flex-col divide-y divide-line-soft">
          {PLATFORMS.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-24 text-sm font-semibold">{p.label}</span>
              <span role="radiogroup" aria-label={`${p.label} colour`} className="flex gap-1.5">
                {props.palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={platformColors[p.id] === c}
                    aria-label={c}
                    disabled={!props.canEdit}
                    onClick={() => {
                      const next = { ...platformColors, [p.id]: c };
                      setPlatformColors(next);
                      save({ platformColors: next });
                    }}
                    className={`size-6 rounded-full ring-offset-2 ${platformColors[p.id] === c ? "ring-2 ring-ink" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </span>
              {platformColors[p.id] !== props.defaultColors[p.id] && props.canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...platformColors, [p.id]: props.defaultColors[p.id] };
                    setPlatformColors(next);
                    save({ platformColors: next });
                  }}
                  className="text-xs text-muted hover:text-ink"
                >
                  Default
                </button>
              )}
              <label className="ml-auto flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hidden.includes(p.id)}
                  disabled={!props.canEdit || (!hidden.includes(p.id) && hidden.length === PLATFORMS.length - 1)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...hidden, p.id] : hidden.filter((h) => h !== p.id);
                    setHidden(next);
                    save({ hiddenPlatforms: next });
                  }}
                />
                Hide
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Hidden platforms stay on posts that already use them. Custom planning-only channels (a WhatsApp channel, a blog) aren’t available yet.</p>
      </section>
      {!props.canEdit && <p className="text-sm text-muted">Only Managers, Admins and the Owner can change these.</p>}
    </div>
  );
}
