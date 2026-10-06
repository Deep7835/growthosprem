import Link from "next/link";
import { addComment, captionAssist, customiseCaptions, moveContent, savePlatformCaption, shareForReview, updateContentField, keepOneCaption } from "@/app/o/[org]/s/[space]/actions";
import { addPlatform, markManual, removePlatform, retry, schedule, shareToFeed, unschedule } from "@/app/o/[org]/s/[space]/publish-actions";
import type { PublishView } from "@/server/publishing";
import { PreviewSwitcher } from "@/components/preview/PostPreview";
import { LeftTabs } from "./LeftTabs";
import { PublishingSection, ScheduleControls } from "./Publishing";
import { CaptionEditor } from "./CaptionEditor";
import { PostTasks } from "@/components/tasks/PostTasks";
import { addTemplateTasks, editTask, newTask } from "@/app/o/[org]/s/[space]/task-actions";
import type { PostTasks as PostTasksData } from "@/server/tasks";
import { attachToContent, detachFromContent, moveContentMedia } from "@/app/o/[org]/s/[space]/media/actions";
import { ContentMedia } from "@/components/media/ContentMedia";
import { PublishState, buttonClass } from "@/components/ui";
import { formatDateTime, formatSchedule } from "@/lib/format";
import { CAPTION_LIMITS, PLACEMENTS, PLATFORM_NAMES, type PlacementKind, type Platform } from "@/lib/placements";
import type { ContentDetail } from "@/server/content";
import { ActivityTabs, InlineField, PanelFrame } from "./PanelClient";
import { AssigneePicker, GroupRail, PostMenu, ProjectPicker, StatusPicker, TagsPicker } from "./PostControls";
import { duplicatePost, repurposePost, revokeShareLink, sharePosts } from "@/app/o/[org]/s/[space]/content-actions";
import { bulkAction, editCell } from "@/app/o/[org]/s/[space]/table/actions";
import { Icon, type IconName } from "@/components/icons";
import type { PanelExtras } from "@/server/content-ops";

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  title: "Title",
  caption: "Caption",
  hashtags: "Hashtags",
  firstComment: "First comment",
};

function describe(a: ContentDetail["activity"][number]): string {
  if (a.action === "updated" && a.field === "status") return `Status set to ${a.after} by ${a.actorLabel}`;
  if (a.action === "updated" && a.field) return `${FIELD_LABEL[a.field] ?? a.field} edited by ${a.actorLabel}`;
  if (a.action === "approved") return `Approved by ${a.actorLabel}`;
  if (a.action === "requested changes") return `Changes requested by ${a.actorLabel}`;
  if (a.action === "approval cleared") return `Approval cleared because the content changed`;
  return `${a.action[0].toUpperCase()}${a.action.slice(1)} by ${a.actorLabel}`;
}

function Prop({ icon, label, children, id }: { icon: IconName; label: string; children: React.ReactNode; id?: string }) {
  return (
    <>
      <dt className="flex h-8 items-center gap-2 text-muted">
        <Icon name={icon} size={15} /> {label}
      </dt>
      <dd id={id} className="flex min-w-0 flex-wrap items-center gap-2">
        {children}
      </dd>
    </>
  );
}

export function ContentPanel({
  detail,
  extras,
  canShare,
  org,
  space,
  spaceName,
  timezone,
  canEdit,
  canSchedule,
  publishing,
  requestTime,
  closeHref,
  postTasks,
  statusesHref = null,
}: {
  detail: ContentDetail;
  extras: PanelExtras;
  /** SH-02: Managers and Editors can share links. */
  canShare: boolean;
  /** ST-06: shortcut to status management, for people who can change it. */
  statusesHref?: string | null;
  postTasks: PostTasksData | null;
  org: string;
  space: string;
  spaceName: string;
  timezone: string;
  canEdit: boolean;
  canSchedule: boolean;
  publishing: PublishView;
  requestTime: number;
  closeHref: string;
}) {
  const { item } = detail;
  const save = (field: string) => updateContentField.bind(null, org, space, item.id, field);
  const platforms = [...new Set(detail.placements.map((p) => PLACEMENTS[p.kind as PlacementKind].platform))] as Platform[];
  const privateComments = detail.comments.filter((c) => c.visibility === "private");
  const publicComments = detail.comments.filter((c) => c.visibility === "public");

  return (
    <PanelFrame closeHref={closeHref} title={item.title}>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-line bg-gradient-to-r from-[#fde7c4] via-[#fff4e4] to-surface px-5 py-3">
        <p className="text-sm text-ink-2">
          {spaceName}
          {detail.projectName ? ` › ${detail.projectName}` : ""}
          {extras.siblings.length > 1 && <span className="ml-2 rounded-md bg-surface/70 px-1.5 py-0.5 text-xs font-semibold">Repurposed group</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PostMenu
            title={item.title}
            contentId={item.id}
            kinds={detail.placements.map((p) => p.kind as PlacementKind)}
            grouped={extras.siblings.length > 1}
            canEdit={canEdit}
            canShare={canShare}
            siblings={extras.siblings}
            links={extras.links}
            closeHref={closeHref}
            share={sharePosts.bind(null, org, space)}
            revoke={revokeShareLink.bind(null, org, space)}
            repurpose={repurposePost.bind(null, org, space, item.id)}
            duplicate={duplicatePost.bind(null, org, space, item.id)}
            bulk={bulkAction.bind(null, org, space)}
          />
          <ScheduleControls
            org={org}
            space={space}
            view={publishing}
            timeZone={timezone}
            scheduleText={formatSchedule(item.scheduledAt, timezone)}
            canSchedule={canSchedule}
            requestTime={requestTime}
            schedule={schedule.bind(null, org, space, item.id)}
            unschedule={unschedule.bind(null, org, space, item.id)}
            share={shareForReview.bind(null, org, space)}
          />
          <Link href={closeHref} scroll={false} aria-label="Close panel" className={buttonClass("ghost", "sm")}>
            ✕
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[28fr_42fr_30fr]">
        {/* Media and preview (CT-02, CT-03) */}
        <section id="panel-media" aria-label="Media and preview" className="flex flex-col gap-4 border-line p-5 lg:border-r">
          <LeftTabs
            start={detail.media.length > 0 && publishing.previews.length > 0 ? "preview" : "media"}
            media={
            <ContentMedia
              org={org}
              space={space}
              attached={detail.media}
              library={detail.library}
              canEdit={canEdit}
              attach={attachToContent.bind(null, org, space, item.id)}
              detach={detachFromContent.bind(null, org, space, item.id)}
              move={moveContentMedia.bind(null, org, space, item.id)}
            />
            }
            preview={<PreviewSwitcher posts={publishing.previews} />}
          />
        </section>

        {/* Details */}
        <section aria-label="Details" className="flex flex-col gap-4 border-line p-5 lg:border-r">
          <InlineField
            label="Title"
            initial={item.title}
            save={save("title")}
            readOnly={!canEdit}
            className="font-display text-2xl font-bold"
          />
          <GroupRail siblings={extras.siblings} closeHref={closeHref} />
          <dl className="grid grid-cols-[120px_1fr] items-start gap-x-3 gap-y-1.5 px-2 text-sm">
            <Prop icon="check" label="Status" id="panel-status">
              <StatusPicker
                key={item.statusId}
                statuses={detail.statuses}
                current={item.statusId}
                disabled={!canEdit}
                move={moveContent.bind(null, org, space, item.id)}
                manageHref={statusesHref}
              />
              <PublishState state={item.publishState} />
            </Prop>
            <Prop icon="users" label="Assignees">
              <AssigneePicker people={extras.members} initial={detail.assignees} disabled={!canEdit} edit={editCell.bind(null, org, space, item.id)} />
            </Prop>
            <Prop icon="folder" label="Project">
              <ProjectPicker projects={extras.projects} initial={item.projectId} disabled={!canEdit} edit={editCell.bind(null, org, space, item.id)} />
            </Prop>
            <Prop icon="tag" label="Tags">
              <TagsPicker initial={item.tags} options={extras.tagOptions} disabled={!canEdit} edit={editCell.bind(null, org, space, item.id)} />
            </Prop>
            <Prop icon="calendar" label="Schedule">
              <span className="px-2 py-1">
                {formatSchedule(item.scheduledAt, timezone) ?? <span className="text-muted">Unscheduled</span>}
                {item.scheduledAt && (
                  <span className="text-muted">
                    {" "}
                    {timezone === "Asia/Kolkata" ? "IST" : timezone} · Autopost {item.autopost ? "on" : "off"}
                  </span>
                )}
              </span>
            </Prop>
            <Prop icon="sparkles" label="Pillar">
              <span className="px-2 py-1">{item.pillar ?? <span className="text-muted">None</span>}</span>
            </Prop>
          </dl>

          <PublishingSection
            org={org}
            space={space}
            view={publishing}
            canEdit={canEdit}
            canSchedule={canSchedule}
            add={addPlatform.bind(null, org, space, item.id)}
            placementActions={Object.fromEntries(
              publishing.placements.map((p) => [
                p.id,
                {
                  retry: retry.bind(null, org, space, p.id),
                  markManual: markManual.bind(null, org, space, p.id),
                  remove: removePlatform.bind(null, org, space, p.id),
                  shareToFeed: shareToFeed.bind(null, org, space, p.id),
                },
              ]),
            )}
          />

          <CaptionEditor
            shared={item.caption}
            platforms={platforms.map((p) => {
              const mine = detail.placements.filter((pl) => PLACEMENTS[pl.kind as PlacementKind].platform === p);
              const live = mine.find((pl) => pl.state !== "published" && pl.captionOverride !== null) ?? mine.find((pl) => pl.captionOverride !== null);
              return { id: p, label: PLATFORM_NAMES[p], limit: CAPTION_LIMITS[p], caption: live?.captionOverride ?? null };
            })}
            canEdit={canEdit}
            saveShared={save("caption")}
            savePlatform={savePlatformCaption.bind(null, org, space, item.id)}
            customise={customiseCaptions.bind(null, org, space, item.id)}
            merge={keepOneCaption.bind(null, org, space, item.id)}
            assist={captionAssist.bind(null, org, space, item.id)}
            setHashtags={save("hashtags")}
          />
          <div className="flex flex-col gap-1">
            <h3 className="px-2 text-sm font-semibold">Hashtags</h3>
            <InlineField key={`hashtags-${item.hashtags}`} label="Hashtags" initial={item.hashtags} save={save("hashtags")} readOnly={!canEdit} placeholder="#diwali #cafe" />
          </div>
          {postTasks && (
            <PostTasks
              data={postTasks}
              contentId={item.id}
              canEdit={canEdit}
              timeZone={timezone}
              now={requestTime}
              create={newTask.bind(null, org, space)}
              setDone={editTask.bind(null, org, space)}
              applyTemplate={addTemplateTasks.bind(null, org, space, item.id)}
            />
          )}
        </section>

        {/* Activity */}
        <section aria-label="Activity" className="flex min-h-[480px] flex-col">
          <ActivityTabs
            privateTab={
              <>
                <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
                  {privateComments.map((c) => (
                    <li key={c.id} className="rounded-lg bg-subtle p-3">
                      <p className="font-semibold">
                        {c.authorName} <span className="font-normal text-muted">· {formatDateTime(c.createdAt, timezone)}</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line">{c.body}</p>
                    </li>
                  ))}
                  {detail.activity.map((a) => (
                    <li key={a.id} className="text-[13px] text-muted">
                      {describe(a)}, {formatDateTime(a.at, timezone)}
                    </li>
                  ))}
                </ol>
                {canEdit && (
                  <form action={addComment.bind(null, org, space, item.id)} className="flex gap-2 border-t border-line p-3">
                    <label htmlFor="comment" className="sr-only">
                      Message your team
                    </label>
                    <input
                      id="comment"
                      name="body"
                      required
                      placeholder="Write a message to your team…"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm"
                    />
                    <button type="submit" className={buttonClass("primary")}>
                      Send
                    </button>
                  </form>
                )}
              </>
            }
            publicTab={
              <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
                {publicComments.length === 0 && (
                  <li className="text-muted">Client comments appear here once this post is shared for review.</li>
                )}
                {publicComments.map((c) => (
                  <li key={c.id} className="rounded-lg bg-warn-bg p-3 text-warn-ink">
                    <p className="font-semibold">
                      {c.authorName} (client) <span className="font-normal">· {formatDateTime(c.createdAt, timezone)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-line">{c.body}</p>
                  </li>
                ))}
              </ol>
            }
            aiTab={
              <div className="flex flex-col gap-3 p-4 text-sm text-muted">
                <p>Ask AI Copilot about {spaceName}: plan around this post, compare it with what works, or rewrite it. Use the caption buttons for quick edits.</p>
                <Link href={`/o/${org}/ai?space=${space}`} className={buttonClass("secondary", "sm")}>
                  Open AI Copilot for {spaceName}
                </Link>
              </div>
            }
          />
        </section>
      </div>
    </PanelFrame>
  );
}
