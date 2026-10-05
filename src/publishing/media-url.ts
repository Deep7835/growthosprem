// Signed, expiring links Meta uses to download a post's media. Our media is private, so
// Meta gets a link that works for a few hours and only for that file.
import { createHmac, timingSafeEqual } from "node:crypto";
import { tokenKey } from "@/lib/crypto";

const TTL_MS = 6 * 3600_000;

const secret = () => createHmac("sha256", tokenKey()).update("public-media-url").digest();
const sign = (assetId: string, exp: number) => createHmac("sha256", secret()).update(`${assetId}.${exp}`).digest("base64url");

/** The app's public address: APP_URL, or localhost in development. */
export function publicBase() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Meta's servers have to be able to download from us: not possible from localhost. */
export function mediaReachable(fake: boolean) {
  if (fake) return true;
  try {
    const host = new URL(publicBase()).hostname;
    return !(host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]" || /^127\./.test(host) || host.endsWith(".local"));
  } catch {
    return false;
  }
}

export function publicMediaUrl(assetId: string, now = Date.now(), base = publicBase()) {
  const exp = Math.floor((now + TTL_MS) / 1000);
  return `${base}/api/media/public/${assetId}?exp=${exp}&sig=${sign(assetId, exp)}`;
}

export function verifyMediaSignature(assetId: string, exp: string | null, sig: string | null, now = Date.now()) {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const a = Buffer.from(sign(assetId, Number(exp)));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
