import Link from "next/link";
import { HELP_ARTICLES } from "@/lib/help";
import { getOrgContext } from "@/server/tenancy";

export const metadata = { title: "Help" };

/** All help articles (Support Center › All help articles). */
export default async function HelpIndex({ params }: PageProps<"/o/[org]/help">) {
  const { org } = await params;
  await getOrgContext(org);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-2xl font-bold">Help</h1>
        <p className="text-sm text-muted">How Plotline works. Can’t find it? Open Support Center in the sidebar and send us a ticket.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {HELP_ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link href={`/o/${org}/help/${a.slug}`} className="flex h-full flex-col gap-1 rounded-xl border border-line bg-surface p-4 hover:border-ink-2/40 hover:shadow-sm">
              <b className="text-[15px]">{a.title}</b>
              <span className="text-sm text-muted">{a.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
