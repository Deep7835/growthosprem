import Link from "next/link";
import { notFound } from "next/navigation";
import { HELP_ARTICLES } from "@/lib/help";
import { getOrgContext } from "@/server/tenancy";

export async function generateMetadata({ params }: PageProps<"/o/[org]/help/[slug]">) {
  const { slug } = await params;
  return { title: HELP_ARTICLES.find((a) => a.slug === slug)?.title ?? "Help" };
}

export default async function HelpArticlePage({ params }: PageProps<"/o/[org]/help/[slug]">) {
  const { org, slug } = await params;
  await getOrgContext(org);
  const article = HELP_ARTICLES.find((a) => a.slug === slug);
  if (!article) notFound();
  const others = HELP_ARTICLES.filter((a) => a.slug !== slug).slice(0, 4);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8">
      <Link href={`/o/${org}/help`} className="text-sm font-semibold text-muted hover:text-ink">
        ← All help articles
      </Link>
      <article className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold">{article.title}</h1>
        <p className="text-[15px] text-muted">{article.summary}</p>
        {article.body.map((p, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-ink-2">
            {p}
          </p>
        ))}
      </article>
      <section className="flex flex-col gap-2 border-t border-line pt-5">
        <h2 className="text-sm font-semibold">More help</h2>
        <ul className="flex flex-col gap-1">
          {others.map((a) => (
            <li key={a.slug}>
              <Link href={`/o/${org}/help/${a.slug}`} className="text-sm text-ink-2 underline-offset-2 hover:underline">
                {a.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
