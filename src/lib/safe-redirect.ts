/** A same-site path to return to after sign-in, or null. Blocks "//evil.com" and absolute URLs (open redirects). */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
