import { notFound } from "next/navigation";
import { getContentDetail } from "@/server/content";
import { panelExtras } from "@/server/content-ops";
import { getPublishView } from "@/server/publishing";
import { tasksForPost } from "@/server/tasks";
import type { SpaceContext } from "@/server/tenancy";
import { ContentPanel } from "./ContentPanel";

/** The content panel over any space view (?content=id), closing back to that view (CT-14). */
export async function PanelHost({ ctx, org, space, contentId, closeHref }: { ctx: SpaceContext; org: string; space: string; contentId: string | null; closeHref: string }) {
  if (!contentId) return null;
  if (!/^[0-9a-f-]{36}$/.test(contentId)) notFound();
  const [detail, publishing, postTasks] = await Promise.all([getContentDetail(ctx, contentId), getPublishView(ctx, contentId), tasksForPost(ctx, contentId)]);
  if (!detail || !publishing) notFound();
  const extras = await panelExtras(ctx, detail.item);
  return (
    <ContentPanel
      key={detail.item.id}
      detail={detail}
      extras={extras}
      canShare={ctx.can("share.create")}
      org={org}
      space={space}
      spaceName={ctx.space.name}
      timezone={ctx.space.timezone}
      canEdit={ctx.can("content.edit")}
      canSchedule={ctx.can("content.schedule")}
      publishing={publishing}
      requestTime={ctx.requestTime}
      closeHref={closeHref}
      postTasks={postTasks}
      statusesHref={ctx.can("space.settings") ? `/o/${org}/s/${space}/settings/statuses` : null}
    />
  );
}
