import { TagChip } from "@/components/shell/SidebarExtras";
import { CHANGELOG } from "@/lib/changelog";
import { getOrgContext } from "@/server/tenancy";

export const metadata = { title: "Product updates" };

const day = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Everything that changed, newest first (the sidebar's Product updates shows the latest few). */
export default async function UpdatesPage({ params }: PageProps<"/o/[org]/updates">) {
  const { org } = await params;
  await getOrgContext(org);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-2xl font-bold">Product updates</h1>
        <p className="text-sm text-muted">New features, improvements and fixes in Plotline.</p>
      </header>
      <ol className="flex flex-col gap-4">
        {CHANGELOG.map((c) => (
          <li key={c.id} id={c.id} className="scroll-mt-16 rounded-xl border border-line bg-surface p-5">
            <p className="text-xs text-muted">{day(c.date)}</p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-[17px] font-semibold">
              {c.title}
              <span className="flex gap-1">
                {c.tags.map((t) => (
                  <TagChip key={t} tag={t} />
                ))}
              </span>
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{c.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
