import Link from "next/link";
import { AuditView } from "@/components/audit/AuditView";
import { EmptyState, buttonClass } from "@/components/ui";
import { getSpaceAudit } from "@/server/audit";
import { getSpaceContext } from "@/server/tenancy";
import { addAuditDrafts, toggleRecommendation, undoAuditDrafts } from "./actions";

export const metadata = { title: "First audit" };

function periodText(since: string, until: string, timeZone: string) {
  const f = (d: string, year: boolean) =>
    new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: year ? "numeric" : undefined, timeZone }).format(new Date(d));
  return `${f(since, false)} – ${f(until, true)}`;
}

export default async function AuditPage({ params }: PageProps<"/o/[org]/s/[space]/audit">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const result = await getSpaceAudit(ctx);

  if (result.state === "no-accounts") {
    return (
      <div className="p-6">
        <EmptyState
          title="Connect an account to get your audit"
          body={`Once ${ctx.space.name}’s Instagram or Facebook is connected, we import the last 90 days of posts and show what is working, what is not and what to do next.`}
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
  if (!result.audit.enough) {
    return (
      <div className="p-6">
        <EmptyState
          title="Not enough posts to audit yet"
          body={`The audit needs at least 5 posts from the last 90 days. ${ctx.space.name} has ${result.audit.postCount}. Keep posting and check back.`}
        />
      </div>
    );
  }

  return (
    <AuditView
      spaceName={ctx.space.name}
      periodText={periodText(result.since, result.until, ctx.space.timezone)}
      isDemo={result.isDemo}
      accounts={result.accounts}
      audit={result.audit}
      addedToPlan={result.addedToPlan}
      onCalendar={result.onCalendar}
      canEdit={ctx.can("content.edit")}
      boardHref={`/o/${org}/s/${space}/board`}
      toggleRecommendation={toggleRecommendation.bind(null, org, space)}
      addDrafts={addAuditDrafts.bind(null, org, space)}
      undoDrafts={undoAuditDrafts.bind(null, org, space)}
    />
  );
}
