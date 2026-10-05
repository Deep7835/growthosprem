/** "Thu 15 Oct, 6:00 PM" in the space's timezone, Indian conventions (PRD section 10). */
export function formatSchedule(date: Date | string | null, timeZone: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
    .format(d)
    .toUpperCase();
  return `${day.replace(",", "")}, ${time}`;
}

export function formatDateTime(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  })
    .format(new Date(date))
    .replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
