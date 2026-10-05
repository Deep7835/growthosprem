import { eq } from "drizzle-orm";
import Link from "next/link";
import { withOrg } from "@/db";
import { socialAccounts } from "@/db/schema";
import { AutoRefresh } from "@/components/accounts/AccountsClient";
import { SpaceTabs } from "@/components/shell/SpaceTabs";
import { getSpaceContext } from "@/server/tenancy";
import { buttonClass } from "@/components/ui";
import { shareForReview } from "./actions";

export default async function SpaceLayout({ children, params }: LayoutProps<"/o/[org]/s/[space]">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const base = `/o/${org}/s/${space}`;
  const accounts = await withOrg(ctx.org.id, (tx) => tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id)));
  const importing = accounts.filter((a) => a.syncState === "import_queued" || a.syncState === "importing");
  const broken = accounts.filter((a) => a.status === "reconnect_needed");

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-line bg-surface px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-7 place-items-center rounded-lg text-sm font-bold"
              style={{ background: ctx.space.avatarColor }}
            >
              {ctx.space.name[0]}
            </span>
            <h1 className="font-display text-xl font-bold">{ctx.space.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${base}/settings/accounts`} className={buttonClass("secondary", "sm")}>
              Settings
            </Link>
            <Link href={`${base}/media`} className={buttonClass("secondary", "sm")}>
              Media
            </Link>
            <Link href={`${base}/brand`} className={buttonClass("secondary", "sm")}>
              Brand Brain
            </Link>
            {ctx.can("ai.use") && (
              <Link href={`/o/${org}/ai?space=${space}`} className={buttonClass("secondary", "sm")}>
                AI Copilot
              </Link>
            )}
            {ctx.can("share.create") && (
              <form action={shareForReview.bind(null, org, space)}>
                <button type="submit" className={buttonClass("primary", "sm")}>
                  Share for client review
                </button>
              </form>
            )}
          </div>
        </div>
        <SpaceTabs base={base} />
      </div>
      {broken.length > 0 && (
        <p role="alert" className="flex flex-wrap items-center gap-2 border-b border-line bg-danger-bg px-6 py-2.5 text-sm text-danger">
          <strong>{broken.map((a) => a.handle).join(", ")}</strong> {broken.length === 1 ? "needs" : "need"} reconnecting: syncing has stopped and posts to{" "}
          {broken.length === 1 ? "it" : "them"} can’t publish.
          <Link href={`${base}/settings/accounts`} className="font-semibold underline">
            Reconnect
          </Link>
        </p>
      )}
      {importing.length > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-bg px-6 py-2.5 text-sm text-accent-ink">
          <AutoRefresh active />
          Importing the last 90 days from {importing.map((a) => a.handle).join(" and ")}
          {importing.map((a) => a.syncProgress).filter((p) => p?.total).length > 0 &&
            `: ${importing.reduce((n, a) => n + (a.syncProgress?.done ?? 0), 0)} of ${importing.reduce((n, a) => n + (a.syncProgress?.total ?? 0), 0)} posts`}
          …
          <Link href={`${base}/settings/accounts`} className="font-semibold underline">
            Details
          </Link>
        </p>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}
