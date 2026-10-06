"use client";

import { useState } from "react";

/** Soft grey cards that open one at a time. */
export function Faq({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="flex flex-col gap-3">
      {items.map(([q, a], i) => {
        const on = open === i;
        return (
          <div key={q} className={`rounded-[22px] transition-colors ${on ? "bg-[#f2f2f4]" : "bg-[#f6f6f8] hover:bg-[#f0f0f3]"}`}>
            <h3>
              <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-[17px] font-semibold">
                {q}
                <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full bg-white text-black/60 shadow-sm transition-transform duration-300 ${on ? "rotate-45" : ""}`}>
                  +
                </span>
              </button>
            </h3>
            <div id={`faq-${i}`} role="region" className={`grid transition-all duration-500 ease-out ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <p className="overflow-hidden px-6 text-[16px] leading-relaxed text-black/55">
                <span className="block pb-6">{a}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
