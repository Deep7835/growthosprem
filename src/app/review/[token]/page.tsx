import { BrandMark } from "@/components/BrandMark";
import type { Metadata } from "next";
import Link from "next/link";
import { PreviewSwitcher } from "@/components/preview/PostPreview";
import { PlacementChip, buttonClass } from "@/components/ui";
import { formatDateTime, formatSchedule } from "@/lib/format";
import type { PlacementKind } from "@/lib/placements";
import { loadReviewItems, resolveShareLink } from "@/server/review";
import { readReviewer } from "@/server/reviewer";
import { decide, setReviewer } from "./actions";

export const metadata: Metadata = { title: "Content for review", robots: { index: false } };

const CLOSED: Record<string, [string, string]> = {
  missing: ["This link doesn’t exist", "Check that you copied the whole link, or ask your agency for a new one."],
  revoked: ["This link has been turned off", "Your agency stopped sharing these posts. Ask them for a new link if you still need to review."],
  expired: ["This link has expired", "Ask your agency for a new link to keep reviewing."],
};

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-ground">{children}</main>;
}

export default async function ReviewPage({ params, searchParams }: PageProps<"/review/[token]">) {
  const { token } = await params;
  const { edit } = await searchParams;
  const link = await resolveShareLink(token);

  if (link.state !== "ok") {
    const [title, body] = CLOSED[link.state];
    return (
      <Shell>
        <div className="m-4 mt-24 rounded-2xl border border-line bg-surface p-6 text-center">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-muted">{body}</p>
        </div>
      </Shell>
    );
  }

  const [items, reviewer] = await Promise.all([loadReviewItems(link.link.orgId, link.link.id, token), readReviewer()]);
  const approved = items.filter((i) => i.decision?.kind === "approved").length;
  const changes = items.filter((i) => i.decision?.kind === "changes_requested").length;
  const allDone = items.length > 0 && approved + changes === items.length;
  const canApprove = link.link.permission === "approve";

  return (
    <Shell>
      <header className="flex flex-col gap-3 border-b border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <BrandMark name={link.orgName} color={link.brandColor} logo={link.logoData} enabled={link.brandingEnabled} />
            {link.orgName}
          </span>
          {link.link.expiresAt && <span className="text-xs text-muted">Link expires {formatDateTime(link.link.expiresAt, link.timezone).split(",")[0]}</span>}
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">Content for your review</h1>
          <p className="text-sm text-muted">
            {link.spaceName} · {items.length} posts{reviewer ? ` · Reviewing as ${reviewer.name}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <strong>
              {approved} of {items.length} approved
            </strong>
            <span className="text-muted">{changes} with changes</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line-soft">
            <div className="h-full bg-success" style={{ width: `${items.length ? (approved / items.length) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      {!reviewer ? (
        <form action={setReviewer.bind(null, token)} className="m-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">Before you start</h2>
          <p className="text-sm text-muted">Your name shows next to your approvals and comments. No account needed.</p>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Your name
            <input name="name" required maxLength={80} autoComplete="name" className="h-11 rounded-lg border border-line px-3 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Email <span className="font-normal text-muted">(optional, for reminders)</span>
            <input name="email" type="email" autoComplete="email" className="h-11 rounded-lg border border-line px-3 font-normal" />
          </label>
          <button type="submit" className={buttonClass("primary")}>
            Start reviewing
          </button>
        </form>
      ) : (
        <>
          {allDone && (
            <p role="status" className="mx-4 mt-4 rounded-xl bg-success-bg p-4 text-sm text-success-ink">
              <strong className="block text-[15px]">All {items.length} reviewed. Thank you, {reviewer.name}.</strong>
              {link.orgName} can see your decisions now.
            </p>
          )}
          <div className="flex flex-col gap-4 p-4">
            {items.map((item) => {
              const editing = edit === item.id || !item.decision;
              return (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <div className="flex items-center justify-between gap-2 px-4 pt-3 text-[13px]">
                    <span className="font-semibold">{formatSchedule(item.scheduledAt, link.timezone) ?? "Date to be confirmed"}</span>
                    <span className="flex gap-1">
                      {item.kinds.map((k) => (
                        <PlacementChip key={k} kind={k as PlacementKind} />
                      ))}
                    </span>
                  </div>
                  <div className="px-3 pt-3">
                    {item.previews.length > 0 ? (
                      <PreviewSwitcher posts={item.previews} compact />
                    ) : (
                      <p className="rounded-xl bg-subtle p-4 text-sm text-muted">Platforms to be confirmed.</p>
                    )}
                  </div>
                  {item.media.length > 0 && (
                    <p className="flex flex-wrap items-center justify-center gap-x-3 px-4 pt-1.5 text-xs text-muted">
                      {item.media.length > 1 && <span>{item.media.length} items · swipe to see all</span>}
                      {item.media.map((m, i) => (
                        <a key={m.id} href={`/api/review/${token}/media/${m.id}?download`} className="underline">
                          Download{item.media.length > 1 ? ` ${i + 1}` : ""}
                        </a>
                      ))}
                    </p>
                  )}
                  <div className="flex flex-col gap-3 p-4">
                    <h2 className="text-base font-semibold">{item.title}</h2>
                    {!item.caption && <p className="text-sm text-muted">Caption coming soon.</p>}
                    {item.changedSinceDecision && (
                      <p className="rounded-lg bg-accent-bg px-3 py-2 text-[13px] text-accent-ink">Updated since your last review. Please take another look.</p>
                    )}

                    {item.decision && !editing && (
                      <div
                        className={`flex flex-col gap-1 rounded-lg px-3 py-2.5 text-sm ${
                          item.decision.kind === "approved" ? "bg-success-bg text-success-ink" : "bg-warn-bg text-warn-ink"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2 font-semibold">
                          {item.decision.kind === "approved" ? `Approved by ${item.decision.by}` : "Changes requested"}
                          <Link href={`?edit=${item.id}`} scroll={false} className="text-[13px] font-normal underline">
                            Change
                          </Link>
                        </span>
                        {item.decision.note && <span className="text-[13px]">“{item.decision.note}”</span>}
                      </div>
                    )}

                    {canApprove && editing && (
                      <div className="flex flex-col gap-2">
                        <form action={decide.bind(null, token, item.id, "approved")}>
                          <button type="submit" className={`${buttonClass("primary")} h-11 w-full`}>
                            Approve
                          </button>
                        </form>
                        <details className="rounded-lg border border-line">
                          <summary className="flex h-11 cursor-pointer list-none items-center justify-center text-sm font-semibold">
                            Request changes
                          </summary>
                          <form action={decide.bind(null, token, item.id, "changes_requested")} className="flex flex-col gap-2 border-t border-line p-3">
                            <label htmlFor={`note-${item.id}`} className="text-[13px] font-semibold">
                              What should change?
                            </label>
                            <textarea
                              id={`note-${item.id}`}
                              name="note"
                              required
                              rows={3}
                              placeholder="For example: please add the offer dates to the image"
                              className="rounded-lg border border-line p-2.5 text-sm"
                            />
                            <button type="submit" className={`${buttonClass("primary")} h-11`}>
                              Send request
                            </button>
                          </form>
                        </details>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
      <footer className="mt-auto p-6 text-center text-xs text-muted">Powered by Plotline</footer>
    </Shell>
  );
}
