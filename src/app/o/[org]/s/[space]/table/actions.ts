"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/db";
import { contentItems, users, type TableView } from "@/db/schema";
import { addDays, isoDate } from "@/lib/analytics/time";
import { parseDate } from "@/lib/calendar";
import type { Issue } from "@/lib/publishing/rules";
import { logActivity } from "@/server/activity";
import { unschedulePost } from "@/server/publishing";
import { archive, remove, setAssignees, setFields } from "@/server/table";
import { requireSpaceAction } from "@/server/tenancy";
import { moveContent as moveOnCalendar } from "../../../calendar-actions";
import { moveContent as changeStatus, updateContentField } from "../actions";

export type CellResult = { ok: true } | { ok: false; error?: string; issues?: Issue[] };

const id = z.uuid();
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

const Change = z.discriminatedUnion("field", [
  z.object({ field: z.literal("title"), value: z.string().trim().min(1, "A post needs a title.").max(200) }),
  z.object({ field: z.literal("status"), value: z.uuid() }),
  z.object({ field: z.literal("schedule"), value: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable() }),
  z.object({ field: z.literal("assignees"), value: z.array(z.uuid()).max(20) }),
  z.object({ field: z.literal("project"), value: z.uuid().nullable() }),
  z.object({ field: z.literal("tags"), value: z.array(z.string().max(60)).max(30) }),
  z.object({ field: z.literal("pillar"), value: z.string().max(60).nullable() }),
]);

/** Inline editing in the Table (VW-03). Rescheduling uses the same rules as the calendar. */
export async function editCell(org: string, space: string, contentId: string, raw: unknown): Promise<CellResult> {
  try {
    const ctx = await requireSpaceAction(org, space, "content.edit");
    const item = id.parse(contentId);
    const change = Change.parse(raw);
    switch (change.field) {
      case "title":
        await updateContentField(org, space, item, "title", change.value);
        break;
      case "status":
        await changeStatus(org, space, item, change.value);
        break;
      case "schedule":
        if (change.value) return await moveOnCalendar(org, space, item, change.value, ctx.space.timezone);
        await clearSchedule(org, space, item);
        break;
      case "assignees":
        await setAssignees(ctx, item, change.value);
        break;
      case "project":
        await setFields(ctx, item, { projectId: change.value });
        break;
      case "tags":
        await setFields(ctx, item, { tags: change.value });
        break;
      case "pillar":
        await setFields(ctx, item, { pillar: change.value });
        break;
    }
    revalidatePath(`/o/${org}/s/${space}`, "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "That value isn’t valid.") : message(e) };
  }
}

async function clearSchedule(org: string, space: string, contentId: string) {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const [item] = await withOrg(ctx.org.id, (tx) => tx.select().from(contentItems).where(eq(contentItems.id, contentId)));
  if (!item || item.spaceId !== ctx.space.id) throw new Error("That post isn’t in this space any more.");
  if (item.publishState === "scheduled") {
    await unschedulePost(await requireSpaceAction(org, space, "content.schedule"), contentId);
    return;
  }
  if (["published", "publishing", "partially_published"].includes(item.publishState)) throw new Error("Published posts keep their date.");
  await withOrg(ctx.org.id, async (tx) => {
    await tx.update(contentItems).set({ scheduledAt: null, updatedAt: new Date() }).where(eq(contentItems.id, contentId));
    await logActivity(tx, { orgId: ctx.org.id, spaceId: ctx.space.id, contentItemId: contentId, actor: { kind: "user", userId: ctx.user.id, name: ctx.user.name }, action: "removed the date", field: "schedule" });
  });
}

const Bulk = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), statusId: z.uuid() }),
  z.object({ action: z.literal("assign"), userId: z.uuid() }),
  z.object({ action: z.literal("shift"), days: z.number().int().min(-365).max(365) }),
  z.object({ action: z.literal("tag"), tag: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal("project"), projectId: z.uuid().nullable() }),
  z.object({ action: z.literal("archive") }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("delete") }),
]);

export type BulkResult = { done: number; failed: { id: string; reason: string; issues?: Issue[] }[] };

/** The bulk action bar (VW-03): one change for every selected post; each succeeds or fails on its own. */
export async function bulkAction(org: string, space: string, ids: string[], raw: unknown): Promise<BulkResult> {
  const ctx = await requireSpaceAction(org, space, "content.edit");
  const action = Bulk.parse(raw);
  const list = z.array(id).max(500).parse(ids);
  const result: BulkResult = { done: 0, failed: [] };
  for (const item of list) {
    try {
      switch (action.action) {
        case "status":
          await changeStatus(org, space, item, action.statusId);
          break;
        case "assign":
          await setAssignees(ctx, item, [action.userId], "add");
          break;
        case "tag":
          await setFields(ctx, item, { addTag: action.tag });
          break;
        case "project":
          await setFields(ctx, item, { projectId: action.projectId });
          break;
        case "archive":
        case "restore":
          await archive(ctx, item, action.action === "archive");
          break;
        case "delete":
          await remove(ctx, item);
          break;
        case "shift": {
          const [row] = await withOrg(ctx.org.id, (tx) => tx.select().from(contentItems).where(eq(contentItems.id, item)));
          if (!row?.scheduledAt) throw new Error("It has no date to move.");
          const local = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.space.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
            .format(row.scheduledAt)
            .replace(", ", "T");
          const day = isoDate(addDays(parseDate(local.slice(0, 10))!, action.days));
          const moved = await moveOnCalendar(org, space, item, `${day}T${local.slice(11, 16)}`, ctx.space.timezone);
          if (!moved.ok) {
            result.failed.push({ id: item, reason: moved.error ?? moved.issues?.map((i) => i.message).join(" ") ?? "It isn’t ready to publish at the new time.", issues: moved.issues });
            continue;
          }
          break;
        }
      }
      result.done++;
    } catch (e) {
      result.failed.push({ id: item, reason: message(e) });
    }
  }
  revalidatePath(`/o/${org}/s/${space}`, "layout");
  return result;
}

const View = z.object({
  columns: z.array(z.string().max(20)).max(20).optional(),
  filters: z.record(z.string().max(20), z.string().max(80)).optional(),
  sort: z.string().max(30).optional(),
});

/** VW-02: filters, sort and columns are saved per person, per space. */
export async function saveTableView(org: string, space: string, view: TableView) {
  const ctx = await requireSpaceAction(org, space, "content.view");
  const clean = View.parse(view);
  await withOrg(ctx.org.id, (tx) =>
    tx
      .update(users)
      .set({ preferences: { ...ctx.user.preferences, tables: { ...ctx.user.preferences.tables, [ctx.space.id]: clean } } })
      .where(eq(users.id, ctx.user.id)),
  );
}
