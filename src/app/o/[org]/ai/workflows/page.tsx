import { WORKFLOW_TEMPLATES } from "@/ai/workflows";
import { WorkflowsClient } from "@/components/ai/WorkflowsClient";
import { credentialsConfigured } from "@/lib/ai/client";
import { listWorkflows, runsThisMonth } from "@/server/ai-tools";
import { getOrgContext, listVisibleSpaces } from "@/server/tenancy";
import { createWorkflowAction, deleteWorkflowAction, runNowAction, toggleWorkflowAction } from "../tools-actions";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage({ params }: PageProps<"/o/[org]/ai/workflows">) {
  const { org } = await params;
  const [ctx, spaces] = await Promise.all([getOrgContext(org), listVisibleSpaces(org)]);
  const [rows, runs] = await Promise.all([listWorkflows(ctx), runsThisMonth(ctx)]);
  return (
    <WorkflowsClient
      org={org}
      templates={Object.entries(WORKFLOW_TEMPLATES).map(([kind, t]) => ({ kind: kind as keyof typeof WORKFLOW_TEMPLATES, ...t }))}
      rows={rows.map(({ w, spaceName }) => ({
        id: w.id,
        name: w.name,
        kind: w.kind,
        space: spaceName,
        cadence: w.cadence,
        weekday: w.weekday,
        hour: w.hour,
        enabled: w.enabled,
        nextRunAt: w.nextRunAt.toISOString(),
        lastRunAt: w.lastRunAt?.toISOString() ?? null,
        mine: w.createdBy === ctx.user.id,
      }))}
      spaces={spaces.map((s) => ({ slug: s.slug, name: s.name }))}
      canOrgWide={ctx.role === "owner" || ctx.role === "admin"}
      aiReady={credentialsConfigured()}
      runsThisMonth={runs}
      create={createWorkflowAction.bind(null, org)}
      toggle={toggleWorkflowAction.bind(null, org)}
      remove={deleteWorkflowAction.bind(null, org)}
      runNow={runNowAction.bind(null, org)}
    />
  );
}
