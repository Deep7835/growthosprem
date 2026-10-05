// Small shared primitives. Buttons say what happens (PRD 11): "Schedule post", not "Submit".
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { initials } from "@/lib/format";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";

const BUTTON = {
  primary: "bg-ink text-white hover:bg-ink-2 disabled:bg-line disabled:text-muted",
  secondary: "border border-line bg-surface text-ink hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-ink",
} as const;

export function buttonClass(variant: keyof typeof BUTTON = "secondary", size: "sm" | "md" = "md") {
  const sizing = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${sizing} ${BUTTON[variant]}`;
}

export function Button({
  variant,
  size,
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return <button type="button" className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON; size?: "sm" | "md" }) {
  return <Link className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export function Avatar({ name, color = "#E4E3DC", size = 28 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-surface ${isDark(color) ? "text-white" : "text-ink"}`}
      style={{ width: size, height: size, fontSize: size * 0.4, background: color }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people }: { people: { id: string; name: string }[] }) {
  if (people.length === 0) return null;
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, 3).map((p) => (
        <Avatar key={p.id} name={p.name} size={24} />
      ))}
    </span>
  );
}

export function PlacementChip({ kind }: { kind: PlacementKind }) {
  const p = PLACEMENTS[kind];
  const tone = p.platform === "instagram" ? "bg-[#FCEBDD] text-[#8A4200]" : p.platform === "facebook" ? "bg-data-bg text-data" : "bg-[#E3EEF6] text-[#0A4A7A]";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{p.short}</span>;
}

export function StatusDot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

const PUBLISH_LABEL: Record<string, string> = {
  not_scheduled: "Not scheduled",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  partially_published: "Partially published",
  failed: "Failed",
};

/** Publish state sits next to the workflow status, never instead of it (ST-07). */
export function PublishState({ state }: { state: string }) {
  const tone =
    state === "published"
      ? "bg-success-bg text-success-ink"
      : state === "failed" || state === "partially_published"
        ? "bg-danger-bg text-danger"
        : state === "scheduled"
          ? "bg-data-bg text-data"
          : "bg-line-soft text-ink-2";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{PUBLISH_LABEL[state] ?? state}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-16 text-center">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="max-w-md text-[15px] leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}

export function SourceLabel({ kind }: { kind: "data" | "ai" | "web" }) {
  const map = {
    data: ["Your data", "bg-data-bg text-data"],
    ai: ["AI suggestion", "bg-ai-bg text-ai"],
    web: ["Web source", "bg-web-bg text-web"],
  } as const;
  const [label, tone] = map[kind];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}
