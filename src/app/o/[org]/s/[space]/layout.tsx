import Link from "next/link";
import { SpaceTabs } from "@/components/shell/SpaceTabs";
import { getSpaceContext } from "@/server/tenancy";
import { buttonClass } from "@/components/ui";
import { shareForReview } from "./actions";

export default async function SpaceLayout({ children, params }: LayoutProps<"/o/[org]/s/[space]">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const base = `/o/${org}/s/${space}`;

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
      <div className="flex-1">{children}</div>
    </div>
  );
}
