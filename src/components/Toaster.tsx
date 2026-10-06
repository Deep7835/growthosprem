"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type Tone = "error" | "success" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const listeners = new Set<(t: ToastItem) => void>();
let next = 0;

/** Shows a short message in the bottom-right corner; errors stay a little longer. */
export function toast(tone: Tone, title: string, body?: string) {
  const t = { id: ++next, tone, title, body };
  listeners.forEach((l) => l(t));
}

const TONE: Record<Tone, string> = {
  error: "bg-danger text-white",
  success: "bg-ink text-white",
  info: "bg-ink text-white",
};

/** Mounted once in the app shell. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const add = (t: ToastItem) => {
      setItems((list) => [...list.slice(-3), t]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setItems((list) => list.filter((x) => x.id !== t.id));
      }, t.tone === "error" ? 7000 : 4000);
      timers.add(timer);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={`lx-pop pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-xl ${TONE[t.tone]}`}>
          <Icon name={t.tone === "error" ? "alert" : "check"} size={18} className="mt-px" />
          <span className="min-w-0 flex-1 text-sm">
            <b className="block">{t.title}</b>
            {t.body && <span className="block opacity-85">{t.body}</span>}
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))} className="-mr-1 grid size-6 place-items-center rounded-md opacity-80 hover:bg-white/15 hover:opacity-100">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
