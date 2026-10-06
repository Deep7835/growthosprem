"use client";

import { useRef, useState, useTransition } from "react";
import { BrandMark } from "@/components/BrandMark";
import { toast } from "@/components/Toaster";
import { buttonClass } from "@/components/ui";
import type { SettingsResult } from "@/app/o/[org]/settings/actions";
import { Section } from "./ProfileClient";

type Branding = { primary: string | null; secondary: string | null; logoData: string | null; enabled: boolean };

/** Draws the chosen image into a 256 px square PNG, so the logo stays small. */
async function toLogo(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  g.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

function ColorRow({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span>
        <b className="block text-sm font-medium">{label}</b>
        <span className="text-xs text-muted">{hint}</span>
      </span>
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} className="size-9 cursor-pointer rounded-lg border border-line bg-surface p-0.5" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          maxLength={7}
          className="h-9 w-24 rounded-lg border border-line px-2 font-mono text-sm uppercase outline-none focus:border-ink"
        />
      </span>
    </div>
  );
}

export function BrandingClient({ orgName, initial, canEdit, save }: { orgName: string; initial: Branding; canEdit: boolean; save: (b: Branding) => Promise<SettingsResult> }) {
  const [b, setB] = useState(initial);
  const [primary, setPrimary] = useState(initial.primary ?? "#F2A93B");
  const [secondary, setSecondary] = useState(initial.secondary ?? "#17181C");
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const valid = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  const next: Branding = { ...b, primary: valid(primary) ? primary : b.primary, secondary: valid(secondary) ? secondary : b.secondary };
  const changed = JSON.stringify(next) !== JSON.stringify(initial);

  return (
    <fieldset disabled={!canEdit} className="flex flex-col gap-6">
      <Section title="Logo" body="Shown on client review and strategy links. Square images work best.">
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => fileInput.current?.click()} aria-label="Upload a logo" className="rounded-xl ring-1 ring-line hover:ring-ink">
            <BrandMark name={orgName} color={next.primary} logo={b.logoData} size={64} />
          </button>
          <span className="flex gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass("secondary", "sm")}>
              Upload logo
            </button>
            {b.logoData && (
              <button type="button" onClick={() => setB({ ...b, logoData: null })} className={buttonClass("ghost", "sm")}>
                Remove
              </button>
            )}
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setB({ ...b, logoData: await toLogo(file) });
              } catch {
                toast("error", "Couldn’t read that image", "Try a PNG or JPG.");
              }
            }}
          />
        </div>
      </Section>

      <Section title="Colours">
        <div className="divide-y divide-line-soft rounded-xl border border-line px-4">
          <ColorRow label="Primary colour" hint="Your mark and buttons on client pages." value={primary} onChange={setPrimary} />
          <ColorRow label="Secondary colour" hint="Accents and text highlights." value={secondary} onChange={setSecondary} />
        </div>
      </Section>

      <Section title="Use your branding" body="When on, client review and strategy links show your logo and colours instead of the default look.">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm">
          Brand client-facing pages
          <input type="checkbox" role="switch" checked={b.enabled} onChange={(e) => setB({ ...b, enabled: e.target.checked })} className="peer sr-only" />
          <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-line transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-focus" />
        </label>
        <div className="rounded-xl border border-line bg-subtle p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Preview</p>
          <div className="flex items-center gap-2.5 rounded-lg bg-surface p-3 shadow-sm">
            <BrandMark name={orgName} color={next.primary} logo={b.logoData} enabled={b.enabled} />
            <span className="font-semibold">{orgName}</span>
            <span className="ml-auto rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ background: b.enabled && next.primary ? next.primary : "#17181C" }}>
              Approve
            </span>
          </div>
        </div>
      </Section>

      {canEdit && (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={!changed || pending}
            onClick={() =>
              start(async () => {
                const r = await save(next);
                if (r.ok) toast("success", "Branding saved");
                else toast("error", "Couldn’t save branding", r.error);
              })
            }
            className={`${buttonClass("primary")} h-10 px-5`}
          >
            {pending ? "Saving…" : "Save branding"}
          </button>
        </div>
      )}
    </fieldset>
  );
}
