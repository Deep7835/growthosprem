"use client";

import { useEffect } from "react";

/**
 * One place for the site's scroll and pointer motion, so nothing runs per element:
 * - `.reveal` gets `is-in` the first time it scrolls into view;
 * - `[data-live]` gets `is-off` while offscreen, pausing its animations;
 * - `[data-spot]` gets the pointer position for its hover light, at most once a frame.
 */
export function MotionLayer() {
  useEffect(() => {
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          reveal.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));

    const live = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("is-off", !e.isIntersecting)), { rootMargin: "120px 0px" });
    document.querySelectorAll("[data-live]").forEach((el) => live.observe(el));

    let frame = 0;
    let last: PointerEvent | null = null;
    const move = (ev: PointerEvent) => {
      last = ev;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const card = last && (last.target as Element | null)?.closest?.<HTMLElement>("[data-spot]");
        if (!card || !last) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${last.clientX - r.left}px`);
        card.style.setProperty("--my", `${last.clientY - r.top}px`);
      });
    };
    const fine = window.matchMedia("(hover: hover)").matches;
    if (fine) document.addEventListener("pointermove", move, { passive: true });

    return () => {
      reveal.disconnect();
      live.disconnect();
      cancelAnimationFrame(frame);
      if (fine) document.removeEventListener("pointermove", move);
    };
  }, []);
  return <div aria-hidden className="lx-scrollbar" />;
}
