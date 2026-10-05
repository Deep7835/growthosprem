import "server-only";
import { headers } from "next/headers";

/** The app's public address for links in emails: APP_URL in production, else the request's host. */
export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // A request's Host header can be forged, so production links must come from configuration.
  if (process.env.NODE_ENV === "production") throw new Error("Set APP_URL to the app's public address.");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
