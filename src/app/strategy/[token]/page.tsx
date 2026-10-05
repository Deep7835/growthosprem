import type { Metadata } from "next";
import { StrategyView } from "@/components/strategy/StrategyView";
import { loadSharedStrategy } from "@/server/strategy";

export const metadata: Metadata = { title: "Social media strategy", robots: { index: false } };

/** SG-02: the strategy shared by link. Read-only, no login; turning the link off ends access. */
export default async function SharedStrategyPage({ params }: PageProps<"/strategy/[token]">) {
  const { token } = await params;
  const shared = await loadSharedStrategy(token);
  if (!shared) {
    return (
      <main className="mx-auto mt-24 max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-2xl font-bold">This link isn’t active</h1>
        <p className="mt-2 text-muted">The strategy may have been unshared or replaced by a newer link. Ask your agency for the current one.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg font-bold text-white" style={{ background: shared.brandColor ?? "#17181C" }}>
          {shared.orgName[0]}
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">{shared.spaceName}: social media strategy</h1>
          <p className="text-sm text-muted">
            Prepared by {shared.orgName} · version {shared.version} · {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(shared.updatedAt)}
          </p>
        </div>
      </header>
      <StrategyView doc={shared.doc} />
      <footer className="py-6 text-center text-xs text-muted">Powered by Growth OS</footer>
    </main>
  );
}
