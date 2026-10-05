// Token health for Settings › Accounts (SP-04): Active, Expires in N days, Reconnect needed.
export const EXPIRY_WARNING_DAYS = 7;

export function tokenStatus(expiresAt: Date | null, now: Date): "active" | "expiring" | "reconnect_needed" {
  if (!expiresAt) return "active";
  const left = expiresAt.getTime() - now.getTime();
  if (left <= 0) return "reconnect_needed";
  return left <= EXPIRY_WARNING_DAYS * 864e5 ? "expiring" : "active";
}

export function daysLeft(expiresAt: Date, now: Date) {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 864e5));
}

/** A short title from a caption's first line, for imported posts. */
export function titleFromCaption(caption: string, fallback: string) {
  const line = caption.split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) return fallback;
  return line.length > 70 ? `${line.slice(0, 67).trimEnd()}…` : line;
}
