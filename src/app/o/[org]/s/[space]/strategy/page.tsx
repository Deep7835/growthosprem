import { StrategyWorkspace } from "@/components/strategy/StrategyWorkspace";
import type { PlanRow, StrategyDoc } from "@/lib/strategy";
import { loadStrategyPage } from "@/server/strategy";
import { getSpaceContext } from "@/server/tenancy";
import {
  addCustomMoment,
  addToCalendar,
  createStrategy,
  makePlan,
  momentIdea,
  removeCustomMoment,
  restore,
  saveStrategyEdit,
  share,
  unshare,
  updatePlan,
} from "./actions";

export const metadata = { title: "Strategy" };

/** PRD 6.16: strategy wizard and document, 30-day planner, festival and moment calendar. */
export default async function StrategyPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/strategy">) {
  const { org, space } = await params;
  const q = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const page = await loadStrategyPage(ctx);
  const tab = q.tab === "plan" || q.tab === "moments" ? q.tab : "strategy";

  return (
    <StrategyWorkspace
      org={org}
      space={space}
      tab={tab}
      canEditStrategy={ctx.can("space.settings")}
      canEditContent={ctx.can("content.edit")}
      canUseAi={ctx.can("ai.use")}
      inputs={page.inputs}
      history={page.history && { posts: page.history.posts, perWeek: page.history.perWeek, followers: page.history.followers, engagementRate: page.history.engagementRate }}
      versions={page.versions.map((v) => ({ version: v.version, source: v.source, createdAt: v.createdAt.toISOString(), doc: v.doc as StrategyDoc }))}
      currentVersion={page.strategy?.currentVersion ?? 0}
      shared={Boolean(page.strategy?.shareTokenHash)}
      plan={page.plan ? { rows: page.plan.rows as PlanRow[], source: page.plan.source, startsOn: page.plan.startsOn } : null}
      moments={page.moments}
      today={page.today}
      ideaCount={page.openIdeas.length}
      actions={{
        create: createStrategy.bind(null, org, space),
        saveEdit: saveStrategyEdit.bind(null, org, space),
        restore: restore.bind(null, org, space),
        share: share.bind(null, org, space),
        unshare: unshare.bind(null, org, space),
        makePlan: makePlan.bind(null, org, space),
        updatePlan: updatePlan.bind(null, org, space),
        addToCalendar: addToCalendar.bind(null, org, space),
        addMoment: addCustomMoment.bind(null, org, space),
        removeMoment: removeCustomMoment.bind(null, org, space),
        momentIdea: momentIdea.bind(null, org, space),
      }}
    />
  );
}
