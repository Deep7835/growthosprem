"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS = [
  ["#moments", "Use cases"],
  ["#how", "How it works"],
  ["#features", "Features"],
  ["#pricing", "Pricing"],
  ["#faq", "FAQ"],
] as const;

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#ffb15c] to-[#ea580c] text-[15px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.35)] ${className}`}>
      P
    </span>
  );
}

/** A floating dark pill: logo, links on wide screens, "Start free" and a menu. */
export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3">
      <nav aria-label="Main" className="mx-auto max-w-4xl rounded-[22px] bg-[#12141c]/[0.93] text-white shadow-[0_12px_40px_-12px_rgb(0_0_0_/_0.5)] ring-1 ring-white/10">
        <div className="flex h-14 items-center gap-3 pl-3 pr-2">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <Logo />
            Plotline
          </Link>
          <div className="ml-4 hidden flex-1 items-center gap-0.5 md:flex">
            {LINKS.map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                {label}
              </a>
            ))}
          </div>
          <Link href="/sign-in" className="ml-auto hidden rounded-full px-3 py-1.5 text-sm text-white/70 hover:text-white md:inline">
            Sign in
          </Link>
          <Link href="/sign-up" className="ml-auto inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-black transition-transform hover:scale-[1.03] md:ml-0">
            Start free
          </Link>
          <button type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)} className="grid size-10 place-items-center rounded-full hover:bg-white/10 md:hidden">
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M5 9h14M5 15h14" />}
            </svg>
          </button>
        </div>
        <div id="site-menu" className={`grid transition-all duration-300 md:hidden ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div className="flex flex-col px-3 pb-3">
              {[...LINKS, ["/sign-in", "Sign in"] as const].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-[15px] text-white/80 hover:bg-white/10">
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
