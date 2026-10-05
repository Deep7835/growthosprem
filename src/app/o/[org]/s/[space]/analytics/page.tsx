import Link from "next/link";
import { Breakdowns, Contribution, EngagementByPlatform, FollowerGrowth, Heatmap } from "@/components/analytics/charts";
import { ContentTable, Freshness, InsightsPanel, KpiTiles, TopContent } from "@/components/analytics/widgets";
import { EmptyState, buttonClass } from "@/components/ui";
import { PLATFORM_COLOR } from "@/lib/analytics/colors";
import { RANGES, type RangeDays } from "@/lib/analytics/report";
import { PLATFORM_NAMES, type Platform } from "@/lib/placements";
import { getSpaceAnalytics } from "@/server/analytics";
import { getSpaceContext } from "@/server/tenancy";
import { toggleRecommendation } from "../audit/actions";
import { refreshAnalytics } from "./actions";

export const metadata = { title: "Analytics" };

const ALL_PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin"];

function updatedText(iso: string | null) {
  if (!iso) return "Not synced yet";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (minutes < 60) return `Updated ${f.format(-minutes, "minute")}`;
  if (minutes < 60 * 48) return `Updated ${f.format(-Math.round(minutes / 60), "hour")}`;
  return `Updated ${f.format(-Math.round(minutes / 1440), "day")}`;
}

function periodText(start: string, end: string) {
  const f = (iso: string, year: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: year ? "numeric" : undefined, timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, d)),
    );
  };
  return `${f(start, false)} – ${f(end, true)}`;
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold ${active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/analytics">) {
  const { org, space } = await params;
  const q = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const base = `/o/${org}/s/${space}`;

  const days = (RANGES.find((r) => String(r) === q.range) ?? 30) as RangeDays;
  const platform = (ALL_PLATFORMS.find((p) => p === q.platform) ?? "all") as Platform | "all";
  const compare = q.compare !== "0";
  const tab = q.tab === "paid" ? "paid" : "organic";
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const state: Record<string, string | null> = {
      tab: tab === "paid" ? "paid" : null,
      platform: platform === "all" ? null : platform,
      range: days === 30 ? null : String(days),
      compare: compare ? null : "0",
      ...changes,
    };
    for (const [k, v] of Object.entries(state)) if (v) next.set(k, v);
    const s = next.toString();
    return `${base}/analytics${s ? `?${s}` : ""}`;
  };

  if (!ctx.can("analytics.view")) {
    return (
      <div className="p-6">
        <EmptyState title="You don’t have access to analytics" body="Ask a Manager or Admin of this space to add you." />
      </div>
    );
  }

  const result = await getSpaceAnalytics(ctx, { days, platform });
  if (result.state === "no-accounts") {
    return (
      <div className="p-6">
        <EmptyState
          title="Connect an account to see analytics"
          body={`Once ${ctx.space.name}’s Instagram, Facebook or LinkedIn is connected, metrics are collected every day and shown here.`}
          action={
            ctx.can("accounts.connect") ? (
              <Link href={`/o/${org}/s/${space}/settings/accounts`} className={buttonClass("primary")}>
                Connect Instagram and Facebook
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { report } = result;
  const connected = new Set(report.platforms.map((p) => p.platform));

  return (
    <div className="mx-auto flex max-w-[1160px] flex-col gap-5 p-6 pb-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-display text-2xl font-bold">Analytics</h1>
          <nav aria-label="Analytics type" className="flex gap-0.5 rounded-lg bg-line-soft p-[3px]">
            <Pill href={href({ tab: null })} active={tab === "organic"}>
              Organic
            </Pill>
            <Pill href={href({ tab: "paid" })} active={tab === "paid"}>
              Paid ads <span className="rounded border border-line px-1 text-[10px]">V2</span>
            </Pill>
          </nav>
          {result.isDemo && (
            <span className="rounded-full border border-dashed border-faint px-2.5 py-0.5 text-xs font-semibold text-muted">Sample data</span>
          )}
        </div>
        <Freshness updatedText={updatedText(result.updatedAt)} refresh={refreshAnalytics.bind(null, org, space)} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
        <nav aria-label="Platform" className="flex gap-0.5 rounded-lg bg-ground p-[3px]">
          <Pill href={href({ platform: null })} active={platform === "all"}>
            All platforms
          </Pill>
          {ALL_PLATFORMS.filter((p) => connected.has(p)).map((p) => (
            <Pill key={p} href={href({ platform: p })} active={platform === p}>
              <span aria-hidden className="size-2 rounded-full" style={{ background: PLATFORM_COLOR[p] }} />
              {PLATFORM_NAMES[p]}
            </Pill>
          ))}
        </nav>
        <span className="text-[13px] text-muted">
          {connected.size} of {ALL_PLATFORMS.length} platforms connected
        </span>
        <span className="flex-1" />
        <nav aria-label="Date range" className="flex gap-0.5 rounded-lg bg-ground p-[3px]">
          {RANGES.map((r) => (
            <Pill key={r} href={href({ range: r === 30 ? null : String(r) })} active={days === r}>
              {r} days
            </Pill>
          ))}
        </nav>
        <span className="text-[13px] font-semibold">{periodText(report.range.start, report.range.end)}</span>
        <Link href={href({ compare: compare ? "0" : null })} scroll={false} className="flex items-center gap-2 text-[13px]" role="switch" aria-checked={compare}>
          <span className={`grid size-4 place-items-center rounded border ${compare ? "border-ink bg-ink text-white" : "border-faint"}`} aria-hidden>
            {compare ? "✓" : ""}
          </span>
          vs previous period
        </Link>
      </div>

      {tab === "paid" ? (
        <EmptyState
          title="No connected ad accounts"
          body="Connect a Meta ad account to see spend, reach, CPM, CTR, CPC and results next to your organic numbers. Paid ads arrive in V2."
          action={
            <span className={`${buttonClass("primary")} cursor-not-allowed opacity-60`} aria-disabled>
              Connect Meta ad account · V2
            </span>
          }
        />
      ) : (
        <>
          {compare && !report.canCompare && (
            <p className="rounded-xl bg-accent-bg px-4 py-2.5 text-sm text-accent-ink">
              No comparison for {days} days yet: history starts with the first import, so the previous {days} days aren’t available.
            </p>
          )}
          <KpiTiles kpis={report.kpis} days={days} compare={compare && report.canCompare} />
          <InsightsPanel
            insights={report.insights}
            addedToPlan={result.addedToPlan}
            canEdit={ctx.can("content.edit")}
            auditHref={`${base}/audit`}
            toggleRecommendation={toggleRecommendation.bind(null, org, space)}
          />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {ALL_PLATFORMS.map((p) => {
              const card = report.platforms.find((x) => x.platform === p);
              if (!card) {
                return (
                  <div key={p} className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-surface p-4">
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <span aria-hidden className="size-2.5 rounded-full border-2" style={{ borderColor: PLATFORM_COLOR[p] }} />
                      {PLATFORM_NAMES[p]}
                    </span>
                    <p className="flex-1 text-sm text-muted">Connect {PLATFORM_NAMES[p]} to see its followers, views and engagement here.</p>
                    {p === "linkedin" ? (
                      <span className={`${buttonClass("secondary", "sm")} cursor-not-allowed opacity-60`} aria-disabled>
                        Connect · soon
                      </span>
                    ) : (
                      <Link href={`/o/${org}/s/${space}/settings/accounts`} className={buttonClass("secondary", "sm")}>
                        Connect {PLATFORM_NAMES[p]}
                      </Link>
                    )}
                  </div>
                );
              }
              const active = platform === p;
              return (
                <Link
                  key={p}
                  href={href({ platform: active ? null : p })}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={`flex flex-col gap-3 rounded-xl bg-surface p-4 hover:border-ink-2 ${active ? "border-2 border-ink" : "border border-line"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <span aria-hidden className="size-2.5 rounded-full" style={{ background: PLATFORM_COLOR[p] }} />
                      {PLATFORM_NAMES[p]}
                    </span>
                    <span className="text-xs text-muted">{card.handle}</span>
                  </span>
                  <span className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                    {[
                      ["Followers", card.followers.toLocaleString("en-IN")],
                      ["Growth", card.growth == null ? "—" : `${card.growth >= 0 ? "+" : "−"}${Math.abs(card.growth).toLocaleString("en-IN")}`],
                      ["Views", card.views.toLocaleString("en-IN")],
                      ["Engagement rate", `${(card.engagementRate * 100).toFixed(1)}%`],
                    ].map(([k, v]) => (
                      <span key={k} className="flex flex-col">
                        <span className="text-xs text-muted">{k}</span>
                        <strong className="text-lg">{v}</strong>
                      </span>
                    ))}
                  </span>
                  <span className="text-xs font-semibold text-ink-2">{active ? "Showing only this platform · show all" : `Show only ${PLATFORM_NAMES[p]}`}</span>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
            <EngagementByPlatform platforms={report.platforms} />
            <Contribution contribution={report.contribution} />
          </div>
          <FollowerGrowth
            series={report.followerSeries}
            subtitle={platform === "all" ? "All connected accounts, from daily snapshots" : `${PLATFORM_NAMES[platform]}, from daily snapshots`}
            collectingSince={report.collectingSince}
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
            <Breakdowns byFormat={report.breakdowns.byFormat} byPillar={report.breakdowns.byPillar} posts={report.breakdowns.posts} />
            <Heatmap cells={report.breakdowns.heatmap} />
          </div>
          <TopContent posts={report.posts} />
          <ContentTable posts={report.posts} />
        </>
      )}
    </div>
  );
}
