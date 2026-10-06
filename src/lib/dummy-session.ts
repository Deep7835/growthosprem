// The dummy sign-in's session cookie: "<userId>.<expires>.<signature>", signed with HMAC-SHA256
// so it can't be edited to become someone else. Free of Next.js imports so it can be tested.
import { createHmac, timingSafeEqual } from "node:crypto";

export const DUMMY_SESSION_COOKIE = "plotline_session";
export const DUMMY_SESSION_DAYS = 30;

const sign = (payload: string, key: Buffer) => createHmac("sha256", key).update(payload).digest("base64url");

export function sessionValue(userId: string, key: Buffer, now = new Date()) {
  const payload = `${userId}.${now.getTime() + DUMMY_SESSION_DAYS * 864e5}`;
  return `${payload}.${sign(payload, key)}`;
}

/** The user id in a valid, unexpired cookie, or null. */
export function readSession(value: string | undefined, key: Buffer, now = new Date()): string | null {
  const parts = value?.split(".") ?? [];
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = Buffer.from(sign(`${userId}.${expires}`, key));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!(Number(expires) > now.getTime())) return null;
  return userId;
}

/** Compares the shared password without leaking its length or contents through timing. */
export function passwordMatches(given: string, expected: string) {
  const h = (v: string) => createHmac("sha256", "plotline-dummy-password").update(v).digest();
  return timingSafeEqual(h(given), h(expected));
}
