import type { CSSProperties, ElementType, ReactNode } from "react";

/** Fades and lifts its content in when it scrolls into view (once). MotionLayer adds `is-in`. */
export function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  return (
    <Tag className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}

/** Splits a line into words that slide up one after another; `from` continues the count. */
export function Words({ text, from = 0 }: { text: string; from?: number }) {
  return text.split(" ").map((w, i) => (
    <span key={i}>
      {i > 0 && " "}
      <span className="lx-word">
        <span style={{ "--i": from + i } as CSSProperties}>{w}</span>
      </span>
    </span>
  ));
}
