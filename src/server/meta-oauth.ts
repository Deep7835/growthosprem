import "server-only";
import { timingSafeEqual } from "node:crypto";

export const META_STATE_COOKIE = "meta_oauth";

/** The login attempt this browser started, if the callback's state matches it. */
export function checkState(cookie: string | undefined, state: string | null): { org: string; space: string } | null {
  if (!cookie || !state) return null;
  try {
    const saved = JSON.parse(cookie) as { state?: string; org?: string; space?: string };
    if (!saved.state || typeof saved.org !== "string" || typeof saved.space !== "string") return null;
    const a = Buffer.from(saved.state);
    const b = Buffer.from(state);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { org: saved.org, space: saved.space };
  } catch {
    return null;
  }
}
