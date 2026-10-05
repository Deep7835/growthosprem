"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Media and Preview tabs on the left of the content panel (W2, CT-02, CT-03). */
export function LeftTabs({ media, preview, start }: { media: ReactNode; preview: ReactNode; start: "media" | "preview" }) {
  const [tab, setTab] = useState(start);
  useEffect(() => {
    // "Fix media" buttons elsewhere in the panel bring the Media tab back.
    const show = () => setTab("media");
    window.addEventListener("panel:show-media", show);
    return () => window.removeEventListener("panel:show-media", show);
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Media and preview" className="flex gap-0.5 self-start rounded-lg bg-line-soft p-[3px]">
        {(["media", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 text-[13px] font-semibold ${tab === t ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {t === "media" ? "Media" : "Preview"}
          </button>
        ))}
      </div>
      <div role="tabpanel" hidden={tab !== "media"}>
        {media}
      </div>
      <div role="tabpanel" hidden={tab !== "preview"}>
        {preview}
      </div>
    </div>
  );
}
