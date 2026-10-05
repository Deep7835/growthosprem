import Link from "next/link";
import { PanelHost } from "@/components/content/PanelHost";
import { PreviewSwitcher } from "@/components/preview/PostPreview";
import { EmptyState, PublishState, StatusDot } from "@/components/ui";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";
import { loadSpacePreviews, type PreviewRange } from "@/server/previews";
import { getSpaceContext } from "@/server/tenancy";

export const metadata = { title: "Previews" };

const RANGES: [PreviewRange, string][] = [
  ["upcoming", "Upcoming"],
  ["month", "Next 30 days"],
  ["unscheduled", "Unscheduled"],
  ["all", "All"],
];

/** VW-05: posts as they will look on each platform, for internal review and client screenshots. */
export default async function PreviewsPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/previews">) {
  const { org, space } = await params;
  const q = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const range = (RANGES.map((r) => r[0]) as string[]).includes(String(q.range)) ? (q.range as PreviewRange) : "upcoming";
  const kind = typeof q.kind === "string" && q.kind in PLACEMENTS ? (q.kind as PlacementKind) : "all";
  const posts = await loadSpacePreviews(ctx, { org, space, kind, range });
  const base = `/o/${org}/s/${space}/previews`;
  const href = (changes: Record<string, string | null>) => {
    const all: Record<string, string | null> = { range: range === "upcoming" ? null : range, kind: kind === "all" ? null : kind, ...changes };
    const next = new URLSearchParams(Object.entries(all).filter((e): e is [string, string] => Boolean(e[1])));
    return next.size ? `${base}?${next}` : base;
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold">Previews</h2>
        <span className="text-sm text-muted">
          {posts.length} post{posts.length === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />
        <nav aria-label="Placement" className="flex flex-wrap gap-1">
          {(["all", ...(Object.keys(PLACEMENTS) as PlacementKind[]).filter((k) => k !== "li_post")] as const).map((k) => (
            <Link
              key={k}
              href={href({ kind: k === "all" ? null : k })}
              aria-current={kind === k ? "true" : undefined}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${kind === k ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink-2"}`}
            >
              {k === "all" ? "All placements" : PLACEMENTS[k].label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Range" className="flex gap-0.5 rounded-lg bg-line-soft p-[3px]">
          {RANGES.map(([r, label]) => (
            <Link
              key={r}
              href={href({ range: r === "upcoming" ? null : r })}
              aria-current={range === r ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-[13px] font-semibold ${range === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          title={kind === "all" ? "Nothing to preview here" : `No ${PLACEMENTS[kind].label} posts here`}
          body="Posts show here once they have a platform. Try another range, or add platforms to posts on the Board."
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-5">
          {posts.map((p) => (
            <article key={p.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
              <header className="flex flex-col gap-1 px-1">
                <span className="flex items-center justify-between gap-2 text-[12px] text-muted">
                  <span className="font-semibold text-ink-2">{p.when ?? "Unscheduled"}</span>
                  <PublishState state={p.publishState} />
                </span>
                <Link href={`${href({})}${href({}).includes("?") ? "&" : "?"}content=${p.id}`} scroll={false} className="flex items-center gap-2 font-semibold hover:underline">
                  <StatusDot color={p.status.color} />
                  <span className="truncate">{p.title}</span>
                </Link>
              </header>
              <PreviewSwitcher posts={p.previews} compact />
            </article>
          ))}
        </div>
      )}
      <PanelHost ctx={ctx} org={org} space={space} contentId={typeof q.content === "string" ? q.content : null} closeHref={href({})} />
    </div>
  );
}
