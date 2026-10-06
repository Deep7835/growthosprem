"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A button and the panel it opens: closes on an outside click, on Esc (without reaching
 * other Esc handlers) and when `close` is called from inside the panel.
 */
export function Popover({
  label,
  button,
  buttonClassName = "",
  panelClassName = "",
  className = "",
  onOpen,
  children,
}: {
  /** Accessible name for the button when its content is an icon. */
  label?: string;
  button: ReactNode | ((open: boolean) => ReactNode);
  buttonClassName?: string;
  /** Position and size of the panel, e.g. "left-0 top-full mt-1 w-56". */
  panelClassName?: string;
  className?: string;
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative ${className}`}>
      <button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-haspopup="true" onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }} className={buttonClassName}>
        {typeof button === "function" ? button(open) : button}
      </button>
      {open && <div className={`absolute z-50 rounded-xl border border-line bg-surface p-1 text-ink shadow-lg ${panelClassName}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** A row in a Popover menu. */
export const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-ink-2 hover:bg-subtle hover:text-ink";
