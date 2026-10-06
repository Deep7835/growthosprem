"use server";

import { and, asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { contentItems, statuses, tasks, users } from "@/db/schema";
import type { Issue } from "@/lib/publishing/rules";
import { logActivity } from "@/server/activity";
import { parseLocal, schedulePost } from "@/server/publishing";
import { createTask } from "@/server/tasks";
import { getOrgContext, requireSpaceAction } from "@/server/tenancy";

export type MoveResult = { ok: true } | { ok: false; error?: string; issues?: Issue[] };

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function zone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Kolkata";
  }
}

/**
 * Drag on the calendar (OV-06). A post scheduled to publish is rescheduled through the same
 * readiness check as the Schedule dialog; any other post just gets a new planned date.
 */
export async function moveContent(org: string, space: string, contentId: string, when: string, timeZone: string): Promise<MoveResult> {
  if (!LOCAL.test(when)) return { ok: false, error: "That isn’t a valid time." };
  const id = z.uuid().parse(contentId);
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const [item] = await withOrg(ctx.org.id, (tx) => tx.select().from(contentItems).where(and(eq(contentItems.id, id), eq(contentItems.spaceId, ctx.space.id))));
    if (!item) return { ok: false, error: "That post isn’t in this space any more." };
    if (["published", "publishing", "partially_published"].includes(item.publishState)) return { ok: false, error: "Published posts can’t be moved." };

    if (item.publishState === "scheduled") {
      const scheduler = await requireSpaceAction(org, space, "content.schedule");
      const { issues } = await schedulePost(scheduler, id, { mode: item.autopost ? "autopost" : "manual", when, timeZone: zone(timeZone) });
      if (issues.length) return { ok: false, issues };
    } else {
      const at = parseLocal(when, zone(timeZone))!;
      await withOrg(ctx.org.id, async (tx) => {
        await tx.update(contentItems).set({ scheduledAt: at, updatedAt: new Date() }).where(eq(contentItems.id, id));
        await logActivity(tx, {
          orgId: ctx.org.id,
          spaceId: ctx.space.id,
          contentItemId: id,
          actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name },
          action: item.scheduledAt ? "moved on the calendar" : "added to the calendar",
          field: "schedule",
          before: item.scheduledAt?.toISOString() ?? null,
          after: at.toISOString(),
        });
      });
    }
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t move it." };
  }
}

export async function moveTask(org: string, space: string, taskId: string, when: string, timeZone: string): Promise<MoveResult> {
  if (!LOCAL.test(when)) return { ok: false, error: "That isn’t a valid time." };
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const updated = await withOrg(ctx.org.id, (tx) =>
      tx
        .update(tasks)
        .set({ dueAt: parseLocal(when, zone(timeZone)) })
        .where(and(eq(tasks.id, z.uuid().parse(taskId)), eq(tasks.spaceId, ctx.space.id)))
        .returning({ id: tasks.id }),
    );
    if (!updated.length) return { ok: false, error: "That task isn’t in this space any more." };
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t move it." };
  }
}

/** Profile › calendar preferences (PRD 6.20). */
export async function setCalendarPrefs(org: string, prefs: { calendarColor?: "platform" | "status"; weekStartsOn?: 0 | 6 }) {
  const ctx = await getOrgContext(org);
  const next = {
    ...ctx.user.preferences,
    ...(prefs.calendarColor === "platform" || prefs.calendarColor === "status" ? { calendarColor: prefs.calendarColor } : {}),
    ...(prefs.weekStartsOn === 0 || prefs.weekStartsOn === 6 ? { weekStartsOn: prefs.weekStartsOn } : {}),
  };
  await withOrg(ctx.org.id, (tx) => tx.update(users).set({ preferences: next }).where(eq(users.id, ctx.user.id)));
  revalidatePath(`/o/${org}`, "layout");
}

/**
 * "+" on a day, or a click on an empty time (OV-05): a post planned for that time or a task due
 * then, in the chosen space. Returns its id so the calendar can open it.
 */
export async function createOnCalendar(org: string, space: string, kind: "content" | "task", when: string, timeZone: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!LOCAL.test(when)) return { ok: false, error: "That isn’t a valid time." };
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const at = parseLocal(when, zone(timeZone))!;
    if (kind === "task") {
      const task = await createTask(ctx, { title: "New task", dueAt: at });
      revalidatePath(`/o/${org}`, "layout");
      return { ok: true, id: task.id };
    }
    const id = await withOrg(ctx.org.id, async (tx) => {
      const [first] = await tx
        .select({ id: statuses.id })
        .from(statuses)
        .where(and(eq(statuses.spaceId, ctx.space.id), eq(statuses.appliesTo, "content"), eq(statuses.category, "not_started")))
        .orderBy(asc(statuses.position))
        .limit(1);
      if (!first) throw new Error("This space has no Not started status. Add one in Statuses.");
      const [{ top }] = await tx.select({ top: max(contentItems.position) }).from(contentItems).where(eq(contentItems.spaceId, ctx.space.id));
      const [item] = await tx
        .insert(contentItems)
        .values({ orgId: ctx.org.id, spaceId: ctx.space.id, title: "Untitled post", statusId: first.id, scheduledAt: at, position: (top ?? 0) + 1, createdBy: ctx.user.id, autopost: ctx.space.autopostNewContent })
        .returning();
      await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: item.id, actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name }, action: "created on the calendar" });
      return item.id;
    });
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t create it." };
  }
}
