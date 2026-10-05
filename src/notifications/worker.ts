// The worker's notification chores, run every minute: send queued emails, start each
// person's 9 AM digest (NT-04) and notify about tasks due tomorrow or overdue (TK-03).
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { withOrg, type Db } from "@/db/core";
import { contentItems, notificationSettings, notifications, organizations, spaces, tasks, users } from "@/db/schema";
import { enqueue, PRIORITY } from "@/jobs/queue";
import { escapeHtml, sendEmail } from "@/lib/email";
import { DIGEST_HOUR, TYPE_LABEL, localClock, typeOf } from "@/lib/notifications";
import { publicBase } from "@/publishing/media-url";
import { deliver } from "./deliver";
import { sendPendingPushes } from "./push";

export const NOTIFY_JOB = { digest: "notify.digest" } as const;

const footer = (orgSlug: string) => {
  const link = `${publicBase()}/o/${orgSlug}/notifications/settings`;
  return { text: `\n\nChoose what you get by email: ${link}\n`, html: `<p style="color:#6b7280;font-size:13px">Choose what you get by email in <a href="${link}">notification settings</a>.</p>` };
};

/** Emails notifications that asked for email. Without RESEND_API_KEY they are marked skipped. */
export async function sendPendingEmails(db: Db, limit = 50) {
  const pending = await db
    .select({ n: notifications, email: users.email, name: users.name, orgSlug: organizations.slug })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .innerJoin(organizations, eq(organizations.id, notifications.orgId))
    .where(eq(notifications.emailStatus, "pending"))
    .orderBy(notifications.createdAt)
    .limit(limit);
  let sent = 0;
  for (const { n, email, name, orgSlug } of pending) {
    // Claim it, so two workers never send the same email.
    const [claimed] = await db
      .update(notifications)
      .set({ emailStatus: "sending" })
      .where(and(eq(notifications.id, n.id), eq(notifications.emailStatus, "pending")))
      .returning({ id: notifications.id });
    if (!claimed) continue;
    const link = n.href ? `${publicBase()}${n.href}` : `${publicBase()}/o/${orgSlug}/notifications`;
    const f = footer(orgSlug);
    const result = await sendEmail({
      to: email,
      subject: n.title,
      text: `Hi ${name},\n\n${n.title}${n.body ? `\n\n${n.body}` : ""}\n\nOpen it: ${link}${f.text}`,
      html: `<p>Hi ${escapeHtml(name)},</p><p><strong>${escapeHtml(n.title)}</strong></p>${n.body ? `<p>${escapeHtml(n.body)}</p>` : ""}<p><a href="${link}">Open in Growth OS</a></p>${f.html}`,
      idempotencyKey: `notification:${n.id}`,
    });
    await db.update(notifications).set({ emailStatus: result.sent ? "sent" : "skipped" }).where(eq(notifications.id, n.id));
    if (result.sent) sent++;
  }
  return sent;
}

/** Queues the digest for everyone who wants one and whose local time is 9 AM. */
export async function scheduleDigests(db: Db, now = new Date()) {
  const rows = await db
    .select({ orgId: notificationSettings.orgId, userId: notificationSettings.userId, settings: notificationSettings.settings })
    .from(notificationSettings)
    .where(and(eq(notificationSettings.scope, "default"), sql`(${notificationSettings.settings} ->> 'digest') = 'true'`));
  const jobs = rows.flatMap((r) => {
    const clock = localClock(now, r.settings.timeZone ?? "Asia/Kolkata");
    if (clock.hour !== DIGEST_HOUR) return [];
    return [
      {
        kind: NOTIFY_JOB.digest,
        payload: { orgId: r.orgId, userId: r.userId, date: clock.date },
        priority: PRIORITY.health,
        dedupeKey: `digest:${r.orgId}:${r.userId}:${clock.date}`,
      },
    ];
  });
  return enqueue(db, jobs);
}

/** One email with the last day's unread notifications; nothing is sent when there are none. */
export async function sendDigest(db: Db, payload: { orgId: string; userId: string; date: string }, now = new Date()) {
  const [person] = await db
    .select({ email: users.email, name: users.name, orgSlug: organizations.slug, orgName: organizations.name })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, payload.orgId))
    .where(eq(users.id, payload.userId));
  if (!person) return;
  const items = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.orgId, payload.orgId),
        eq(notifications.userId, payload.userId),
        eq(notifications.inApp, true),
        isNull(notifications.readAt),
        isNull(notifications.clearedAt),
        gte(notifications.createdAt, new Date(now.getTime() - 864e5)),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  if (items.length === 0) return;
  const page = `${publicBase()}/o/${person.orgSlug}/notifications`;
  const groups = new Map<string, typeof items>();
  for (const n of items) {
    const label = TYPE_LABEL[typeOf(n.kind)];
    groups.set(label, [...(groups.get(label) ?? []), n]);
  }
  const f = footer(person.orgSlug);
  const lines = [...groups].map(([label, list]) => `${label}\n${list.map((n) => `• ${n.title}`).join("\n")}`).join("\n\n");
  const html = [...groups]
    .map(
      ([label, list]) =>
        `<h3 style="font-size:14px;margin:16px 0 4px">${escapeHtml(label)}</h3><ul>${list
          .map((n) => `<li>${n.href ? `<a href="${publicBase()}${n.href}">${escapeHtml(n.title)}</a>` : escapeHtml(n.title)}</li>`)
          .join("")}</ul>`,
    )
    .join("");
  await sendEmail({
    to: person.email,
    subject: `Your Growth OS digest: ${items.length} unread in ${person.orgName}`,
    text: `Hi ${person.name},\n\nHere’s what happened in ${person.orgName} in the last day.\n\n${lines}\n\nSee them all: ${page}${f.text}`,
    html: `<p>Hi ${escapeHtml(person.name)},</p><p>Here’s what happened in ${escapeHtml(person.orgName)} in the last day.</p>${html}<p><a href="${page}">See all notifications</a></p>${f.html}`,
    idempotencyKey: `digest:${payload.orgId}:${payload.userId}:${payload.date}`,
  });
}

const DAY = 864e5;

/** TK-03: tasks due in the next day, and ones that became overdue in the last three days. Once each. */
export async function sweepTasks(db: Db, now = new Date()) {
  const open = await db
    .select({ task: tasks, spaceSlug: spaces.slug, spaceName: spaces.name, timezone: spaces.timezone, orgSlug: organizations.slug, archived: contentItems.archivedAt })
    .from(tasks)
    .innerJoin(spaces, eq(spaces.id, tasks.spaceId))
    .innerJoin(organizations, eq(organizations.id, tasks.orgId))
    .leftJoin(contentItems, eq(contentItems.id, tasks.contentItemId))
    .where(
      and(
        eq(tasks.done, false),
        isNull(spaces.archivedAt),
        isNull(spaces.deletedAt),
        isNotNull(tasks.assigneeId),
        isNotNull(tasks.dueAt),
        gte(tasks.dueAt, new Date(now.getTime() - 3 * DAY)),
        lt(tasks.dueAt, new Date(now.getTime() + DAY)),
      ),
    );
  let sent = 0;
  for (const { task, spaceSlug, spaceName, timezone, orgSlug, archived } of open) {
    if (archived) continue;
    const due = task.dueAt!;
    const overdue = due.getTime() <= now.getTime();
    const when = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(due);
    const href = `/o/${orgSlug}/s/${spaceSlug}/board?task=${task.id}`;
    sent += await withOrg(db, task.orgId, (tx) =>
      deliver(tx, [task.assigneeId!], {
        orgId: task.orgId,
        spaceId: task.spaceId,
        kind: overdue ? "task_overdue" : "task_due",
        title: overdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
        body: `${spaceName} · due ${when}`,
        href,
        key: `${overdue ? "task_overdue" : "task_due"}:${task.id}:${due.getTime()}`,
      }),
    );
  }
  return sent;
}

/** Every minute from the worker loop. */
export async function notificationChores(db: Db, now = new Date()) {
  await sweepTasks(db, now);
  await scheduleDigests(db, now);
  await sendPendingEmails(db);
  await sendPendingPushes(db);
}
