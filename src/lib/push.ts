// Browser push (NT-03) keys. Shared by the web server and the job worker, so no Next.js imports.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cached: VapidKeys | null | undefined;

/**
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production (generate them once with
 * `npx web-push generate-vapid-keys`). In development a pair is generated into .data/vapid.json.
 * Null when push isn't set up.
 */
export function vapidKeys(): VapidKeys | null {
  if (cached !== undefined) return cached;
  const subject = process.env.VAPID_SUBJECT ?? `mailto:${process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? "support@plotline.app"}`;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return (cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject });
  }
  if (process.env.NODE_ENV === "production") return (cached = null);
  const file = path.join(process.cwd(), ".data", "vapid.json");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
  }
  const keys = JSON.parse(readFileSync(file, "utf8")) as { publicKey: string; privateKey: string };
  return (cached = { ...keys, subject });
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}
