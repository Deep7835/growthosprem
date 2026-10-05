import Link from "next/link";
import { addComment, captionAssist, moveContent, updateContentField } from "@/app/o/[org]/s/[space]/actions";
import { CaptionAssist } from "@/components/ai/CaptionAssist";
import { attachToContent, detachFromContent, moveContentMedia } from "@/app/o/[org]/s/[space]/media/actions";
import { ContentMedia } from "@/components/media/ContentMedia";
import { Avatar, AvatarStack, PlacementChip, PublishState, buttonClass } from "@/components/ui";
import { formatDateTime, formatSchedule } from "@/lib/format";
import { CAPTION_LIMITS, PLACEMENTS, PLATFORM_NAMES, type PlacementKind, type Platform } from "@/lib/placements";
import type { ContentDetail } from "@/server/content";
import { ActivityTabs, InlineField, PanelFrame, StatusSelect } from "./PanelClient";

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

export function ContentPanel({
  detail,
  org,
  space,
  spaceName,
  timezone,
  canEdit,
  closeHref,
}: {
  detail: ContentDetail;
  org: string;
  space: string;
  spaceName: string;
  timezone: string;
  canEdit: boolean;
  closeHref: string;
}) {
  const { item } = detail;
  const save = (field: string) => updateContentField.bind(null, org, space, item.id, field);
  const platforms = [...new Set(detail.placements.map((p) => PLACEMENTS[p.kind as PlacementKind].platform))] as Platform[];
  const counters = platforms.map((p) => ({ label: PLATFORM_NAMES[p], limit: CAPTION_LIMITS[p] }));
  const privateComments = detail.comments.filter((c) => c.visibility === "private");
  const publicComments = detail.comments.filter((c) => c.visibility === "public");
  const firstPlacement = detail.placements[0]?.kind as PlacementKind | undefined;
  const account = detail.accounts.find((a) => a.id === detail.placements[0]?.socialAccountId);
  const cover = detail.media.find((m) => m.type === "image" && m.status === "ready");

  return (
    <PanelFrame closeHref={closeHref} title={item.title}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-sm text-muted">
          {spaceName}
          {detail.projectName ? ` › ${detail.projectName}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <span className={`${buttonClass("secondary", "sm")} cursor-not-allowed opacity-60`} title="Arrives with the publishing milestone">
            Schedule · soon
          </span>
          <Link href={closeHref} scroll={false} aria-label="Close panel" className={buttonClass("ghost", "sm")}>
            ✕
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[28fr_42fr_30fr]">
        {/* Media and preview (CT-02, CT-03) */}
        <section aria-label="Media and preview" className="flex flex-col gap-4 border-line p-5 lg:border-r">
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
          {firstPlacement && (
            <div className="rounded-xl border border-line">
              <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
                <Avatar name={spaceName} color="#F2A93B" size={26} />
                <span className="text-sm font-semibold">{account?.handle ?? spaceName}</span>
                <span className="ml-auto">
                  <PlacementChip kind={firstPlacement} />
                </span>
              </div>
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/o/${org}/s/${space}/media/${cover.id}`} alt="" className="aspect-[4/5] w-full object-cover" />
              )}
              <p className="whitespace-pre-line px-3 py-3 text-sm leading-relaxed text-ink-2">
                {item.caption || <span className="text-muted">The caption preview appears here.</span>}
                {item.hashtags && <span className="mt-1 block text-data">{item.hashtags}</span>}
              </p>
            </div>
          )}
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
          <dl className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-3 px-2 text-sm">
            <dt className="text-muted">Status</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <StatusSelect
                key={item.statusId}
                statuses={detail.statuses}
                current={item.statusId}
                disabled={!canEdit}
                move={moveContent.bind(null, org, space, item.id)}
              />
              <PublishState state={item.publishState} />
            </dd>
            <dt className="text-muted">Assignees</dt>
            <dd>{detail.assignees.length ? <AvatarStack people={detail.assignees} /> : <span className="text-muted">Unassigned</span>}</dd>
            <dt className="text-muted">Platforms</dt>
            <dd className="flex flex-wrap gap-1">
              {detail.placements.length ? (
                detail.placements.map((p) => <PlacementChip key={p.id} kind={p.kind as PlacementKind} />)
              ) : (
                <span className="text-muted">None yet</span>
              )}
            </dd>
            <dt className="text-muted">Schedule</dt>
            <dd>
              {formatSchedule(item.scheduledAt, timezone) ?? <span className="text-muted">Unscheduled</span>}
              {item.scheduledAt && <span className="text-muted"> IST · Autopost {item.autopost ? "on" : "off"}</span>}
            </dd>
            <dt className="text-muted">Pillar</dt>
            <dd>{item.pillar ?? <span className="text-muted">None</span>}</dd>
          </dl>

          <div className="flex flex-col gap-1">
            <h3 className="px-2 text-sm font-semibold">Caption</h3>
            <InlineField
              key={`caption-${item.caption}`}
              label="Caption"
              initial={item.caption}
              save={save("caption")}
              multiline
              readOnly={!canEdit}
              placeholder="Write a caption…"
              className="border-line text-[15px] leading-relaxed"
              counter={counters}
            />
            {canEdit && (
              <CaptionAssist
                caption={item.caption}
                assist={captionAssist.bind(null, org, space, item.id)}
                setCaption={save("caption")}
                setHashtags={save("hashtags")}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="px-2 text-sm font-semibold">Hashtags</h3>
            <InlineField key={`hashtags-${item.hashtags}`} label="Hashtags" initial={item.hashtags} save={save("hashtags")} readOnly={!canEdit} placeholder="#diwali #cafe" />
          </div>
          <div className="flex flex-col gap-2 px-2">
            <h3 className="text-sm font-semibold">
              Tasks{" "}
              <span className="font-normal text-muted">
                {detail.tasks.filter((t) => t.done).length} of {detail.tasks.length} done
              </span>
            </h3>
            {detail.tasks.map((t) => (
              <p key={t.id} className={`text-sm ${t.done ? "text-muted line-through" : ""}`}>
                {t.title}
              </p>
            ))}
          </div>
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
