import { count, inArray, sql } from "drizzle-orm";
import { getSystemDb, withOrg } from "@/db";
import { posts } from "@/db/schema";
import { credentialsConfigured } from "@/lib/ai/client";
import { listMembers } from "@/db/members";
import { buttonClass } from "@/components/ui";
import { canManageMembers } from "@/lib/permissions";
import { creditsUsedThisMonth, usageThisMonth } from "@/server/ai/service";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { retagSpace, setAiBudget } from "../actions";

export const metadata = { title: "AI settings" };

const KIND = { copilot: "Copilot chat", caption: "Caption help", brand_brain: "Brand Brain drafts", ideas: "Idea Bank pillars", strategy: "Strategy", plan: "30-day plans", tagging: "Post tagging" } as Record<string, string>;

export default async function AiSettings({ params }: PageProps<"/o/[org]/ai/settings">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const [used, rows, members, spaces] = await Promise.all([
    creditsUsedThisMonth(ctx.org.id),
    usageThisMonth(ctx.org.id),
    listMembers(await getSystemDb(), ctx.org.id),
    listVisibleSpaces(org),
  ]);
  const tagging = spaces.length
    ? await withOrg(ctx.org.id, (tx) =>
        tx
          .select({
            spaceId: posts.spaceId,
            total: count(),
            waiting: sql<number>`count(*) filter (where ${posts.taggedAt} is null)::int`,
            manual: sql<number>`count(*) filter (where ${posts.tagSource} = 'manual')::int`,
          })
          .from(posts)
          .where(inArray(posts.spaceId, spaces.map((s) => s.id)))
          .groupBy(posts.spaceId),
      )
    : [];
  const aiReady = credentialsConfigured();
  const manage = canManageMembers(ctx.role);
  const sum = (key: "userId" | "spaceId" | "kind") => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r[key] ?? "none";
      m.set(k, (m.get(k) ?? 0) + r.credits);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const name = (id: string) => (id === "none" ? "Automatic (post tagging)" : (members.find((m) => m.userId === id)?.name ?? "Former member"));
  const spaceName = (id: string) => (id === "none" ? "Whole organisation" : (spaces.find((s) => s.id === id)?.name ?? "Another space"));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 pb-14">
      <div>
        <h1 className="font-display text-3xl font-bold">AI settings</h1>
        <p className="mt-1 text-muted">AI usage is metered in credits: 1 credit is US$0.01 of model usage. The monthly budget is a hard cap.</p>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">This month</h2>
        <p className="text-3xl font-semibold">
          {used.toLocaleString("en-IN")} <span className="text-base font-normal text-muted">of {ctx.org.aiMonthlyCredits.toLocaleString("en-IN")} credits</span>
        </p>
        {manage ? (
          <form action={setAiBudget.bind(null, org)} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Monthly budget (credits)
              <input name="credits" type="number" min={0} step={100} defaultValue={ctx.org.aiMonthlyCredits} className="h-10 w-40 rounded-lg border border-line px-3 font-normal" />
            </label>
            <button type="submit" className={buttonClass("primary")}>
              Save budget
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted">Owners and Admins can change the budget.</p>
        )}
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <div>
          <h2 className="text-lg font-semibold">Post tagging</h2>
          <p className="text-sm text-muted">
            Imported and published posts are tagged with a pillar, topic and hook type, so Analytics can show what works. It runs on its own a few minutes after posts arrive and
            uses a small share of the budget.{" "}
            {aiReady ? "" : "It starts once AI is set up (ANTHROPIC_API_KEY)."}
          </p>
        </div>
        {tagging.length === 0 ? (
          <p className="text-sm text-muted">No posts imported yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft text-sm">
            {tagging.map((t) => (
              <li key={t.spaceId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-semibold">{spaceName(t.spaceId)}</span>
                <span className="text-muted">
                  {t.total - t.waiting} of {t.total} tagged{t.waiting ? `, ${t.waiting} waiting` : ""}
                  {t.manual ? `, ${t.manual} set by hand` : ""}
                </span>
                {manage && aiReady && t.total - t.waiting > 0 && (
                  <form action={retagSpace.bind(null, org, t.spaceId)}>
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      Re-tag topics and hooks
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["By member", sum("userId").map(([k, v]) => [name(k), v] as const)],
          ["By space", sum("spaceId").map(([k, v]) => [spaceName(k), v] as const)],
          ["By feature", sum("kind").map(([k, v]) => [KIND[k] ?? k, v] as const)],
        ].map(([title, list]) => (
          <section key={title as string} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="font-semibold">{title as string}</h2>
            {(list as (readonly [string, number])[]).length === 0 && <p className="text-muted">No usage yet.</p>}
            {(list as (readonly [string, number])[]).map(([k, v]) => (
              <p key={k} className="flex justify-between gap-2">
                <span className="truncate">{k}</span>
                <strong>{v.toLocaleString("en-IN")}</strong>
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
