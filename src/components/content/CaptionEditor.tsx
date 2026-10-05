"use client";

import { useState, useTransition } from "react";
import { CaptionAssist } from "@/components/ai/CaptionAssist";
import { buttonClass } from "@/components/ui";
import type { Platform } from "@/lib/placements";
import { InlineField } from "./PanelClient";

export interface PlatformCaption {
  id: Platform;
  label: string;
  limit: number;
  /** Null until the caption is customised per platform. */
  caption: string | null;
}

/** CT-06: one shared caption by default; "Customise per platform" splits it into tabs, each with its own counter and limit. */
export function CaptionEditor({
  shared,
  platforms,
  canEdit,
  saveShared,
  savePlatform,
  customise,
  merge,
  assist,
  setHashtags,
}: {
  shared: string;
  platforms: PlatformCaption[];
  canEdit: boolean;
  saveShared: (value: string) => Promise<void>;
  savePlatform: (platform: Platform, value: string) => Promise<void>;
  customise: () => Promise<void>;
  merge: (keep: Platform) => Promise<void>;
  assist: (mode: string, platform?: Platform) => Promise<{ text?: string; error?: string }>;
  setHashtags: (value: string) => Promise<void>;
}) {
  const customised = platforms.some((p) => p.caption !== null);
  const [tab, setTab] = useState<Platform | null>(null);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = platforms.find((p) => p.id === tab) ?? platforms[0];
  const textOf = (p: PlatformCaption) => p.caption ?? shared;

  const run = (fn: () => Promise<void>, then?: () => void) =>
    start(async () => {
      try {
        await fn();
        setError(null);
        then?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t save. Try again.");
      }
    });

  return (
    <div id="panel-caption" className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2">
        <h3 className="text-sm font-semibold">Caption</h3>
        {canEdit && !customised && platforms.length > 1 && (
          <button type="button" disabled={pending} onClick={() => run(customise)} className="text-xs font-semibold text-muted hover:text-ink disabled:opacity-50">
            {pending ? "Splitting…" : "Customise per platform"}
          </button>
        )}
        {canEdit && customised && !merging && (
          <button type="button" onClick={() => setMerging(true)} className="text-xs font-semibold text-muted hover:text-ink">
            Use one caption
          </button>
        )}
      </div>

      {merging && (
        <div role="group" aria-label="Use one caption" className="mx-2 flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
          <span>Keep which caption for every platform?</span>
          {platforms.map((p) => (
            <button key={p.id} type="button" disabled={pending} onClick={() => run(() => merge(p.id), () => setMerging(false))} className={buttonClass("secondary", "sm")}>
              {p.label}
            </button>
          ))}
          <button type="button" onClick={() => setMerging(false)} className={buttonClass("ghost", "sm")}>
            Cancel
          </button>
        </div>
      )}

      {customised && active ? (
        <>
          <div role="tablist" aria-label="Caption per platform" className="mx-2 flex gap-1 border-b border-line">
            {platforms.map((p) => {
              const over = textOf(p).length > p.limit;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  id={`caption-tab-${p.id}`}
                  aria-selected={p.id === active.id}
                  aria-controls="caption-tabpanel"
                  onClick={() => setTab(p.id)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] font-semibold ${p.id === active.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
                >
                  {p.label}
                  {over && <span aria-label="over the limit" className="size-1.5 rounded-full bg-danger" />}
                </button>
              );
            })}
          </div>
          <div id="caption-tabpanel" role="tabpanel" aria-labelledby={`caption-tab-${active.id}`} className="flex flex-col gap-1">
            <InlineField
              key={`caption-${active.id}-${textOf(active)}`}
              label={`${active.label} caption`}
              initial={textOf(active)}
              save={(v) => savePlatform(active.id, v)}
              multiline
              readOnly={!canEdit}
              placeholder={`Write the ${active.label} caption…`}
              className="border-line text-[15px] leading-relaxed"
              counter={[{ label: active.label, limit: active.limit }]}
            />
            {canEdit && (
              <CaptionAssist
                key={active.id}
                caption={textOf(active)}
                assist={(m) => assist(m, active.id)}
                setCaption={(v) => savePlatform(active.id, v)}
                setHashtags={setHashtags}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <InlineField
            key={`caption-${shared}`}
            label="Caption"
            initial={shared}
            save={saveShared}
            multiline
            readOnly={!canEdit}
            placeholder="Write a caption…"
            className="border-line text-[15px] leading-relaxed"
            counter={platforms.map((p) => ({ label: p.label, limit: p.limit }))}
          />
          {canEdit && <CaptionAssist caption={shared} assist={(m) => assist(m)} setCaption={saveShared} setHashtags={setHashtags} />}
        </>
      )}
      {error && (
        <p role="alert" className="px-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
