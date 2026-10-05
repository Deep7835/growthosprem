// Sends browser push notifications the worker finds queued (NT-03). A subscription the browser
// has dropped (404 or 410) is deleted.
import { and, eq, inArray } from "drizzle-orm";
import webpush, { WebPushError } from "web-push";
import type { Db } from "@/db/core";
import { notifications, pushSubscriptions } from "@/db/schema";
import { typeOf } from "@/lib/notifications";
import { vapidKeys, type PushPayload } from "@/lib/push";

type Subscription = typeof pushSubscriptions.$inferSelect;

/** Sends one payload to every browser of one person. Returns how many accepted it. */
export async function pushTo(db: Db, subs: Subscription[], payload: PushPayload, urgent = false): Promise<number> {
  const keys = vapidKeys();
  if (!keys || subs.length === 0) return 0;
  let ok = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        vapidDetails: keys,
        TTL: 24 * 3600,
        urgency: urgent ? "high" : "normal",
        timeout: 10_000,
      });
      ok++;
      await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(eq(pushSubscriptions.id, sub.id));
    } catch (e) {
      if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        console.error(`Push to ${new URL(sub.endpoint).host} failed`, e instanceof Error ? e.message : e);
      }
    }
  }
  return ok;
}

export async function sendPendingPushes(db: Db, limit = 50) {
  const pending = await db.select().from(notifications).where(eq(notifications.pushStatus, "pending")).orderBy(notifications.createdAt).limit(limit);
  if (pending.length === 0) return 0;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, [...new Set(pending.map((n) => n.userId))]));
  let sent = 0;
  for (const n of pending) {
    const [claimed] = await db
      .update(notifications)
      .set({ pushStatus: "sending" })
      .where(and(eq(notifications.id, n.id), eq(notifications.pushStatus, "pending")))
      .returning({ id: notifications.id });
    if (!claimed) continue;
    const mine = subs.filter((s) => s.userId === n.userId);
    const ok = await pushTo(db, mine, { title: n.title, body: n.body, url: n.href ?? "/", tag: n.id }, typeOf(n.kind) === "action_required");
    await db.update(notifications).set({ pushStatus: ok > 0 ? "sent" : "skipped" }).where(eq(notifications.id, n.id));
    if (ok > 0) sent++;
  }
  return sent;
}
