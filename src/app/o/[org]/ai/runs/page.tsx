import Link from "next/link";
import { listRuns } from "@/server/ai-tools";
import { getOrgContext } from "@/server/tenancy";

export const metadata = { title: "Workflow runs" };

const STATUS = {
  queued: ["Queued", "bg-data-bg text-data"],
  running: ["Running", "bg-data-bg text-data"],
  completed: ["Completed", "bg-success-bg text-success-ink"],
  failed: ["Failed", "bg-danger-bg text-danger"],
} as const;
type Status = keyof typeof STATUS;

/** AI › Runs: every run of the workflows you can see, newest first, with the result. */
export default async function RunsPage({ params, searchParams }: PageProps<"/o/[org]/ai/runs">) {
  const { org } = await params;
  const q = await searchParams;
  const ctx = await getOrgContext(org);
  const chosen = (typeof q.status === "string" ? q.status.split(",") : []).filter((s): s is Status => s in STATUS);
  const runs = await listRuns(ctx, chosen);
  const current = typeof q.run === "string" ? runs.find((r) => r.run.id === q.run) : runs[0];
  const base = `/o/${org}/ai/runs`;
  const href = (changes: { status?: Status[]; run?: string }) => {
    const p = new URLSearchParams();
    const status = changes.status ?? chosen;
    if (status.length) p.set("status", status.join(","));
    if (changes.run) p.set("run", changes.run);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const when = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: ctx.org.timezone }).format(d) : "—");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6 pb-14">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Runs</h1>
          <p className="text-sm text-muted">What your workflows did and when.</p>
        </div>
        <nav aria-label="Run status" className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS) as Status[]).map((s) => {
            const on = chosen.includes(s);
            return (
              <Link key={s} href={href({ status: on ? chosen.filter((x) => x !== s) : [...chosen, s], run: undefined })} aria-current={on ? "true" : undefined} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? `border-transparent ${STATUS[s][1]}` : "border-line text-muted hover:bg-subtle"}`}>
                {STATUS[s][0]}
              </Link>
            );
          })}
        </nav>
      </header>
      {runs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <b>No workflow runs yet</b>
          <p className="text-sm text-muted">{chosen.length ? "None match these statuses." : "When a workflow runs, its result appears here."}</p>
          <Link href={`/o/${org}/ai/workflows`} className="text-sm font-semibold underline">
            Go to Workflows
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <ul className="flex flex-col divide-y divide-line-soft self-start overflow-hidden rounded-xl border border-line bg-surface">
            {runs.map(({ run, name }) => (
              <li key={run.id}>
                <Link href={href({ run: run.id })} aria-current={current?.run.id === run.id ? "page" : undefined} className={`flex flex-col gap-1 px-3 py-2.5 ${current?.run.id === run.id ? "bg-select" : "hover:bg-subtle"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm">{name}</b>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[run.status][1]}`}>{STATUS[run.status][0]}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {when(run.createdAt)} · {run.trigger === "manual" ? "Run now" : "On schedule"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {current && (
            <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[17px] font-semibold">{current.name}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[current.run.status][1]}`}>{STATUS[current.run.status][0]}</span>
              </header>
              <p className="text-xs text-muted">
                Started {when(current.run.startedAt)} · finished {when(current.run.finishedAt)}
              </p>
              {current.run.error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{current.run.error}</p>}
              {current.run.output ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{current.run.output}</div>
              ) : (
                !current.run.error && <p className="text-sm text-muted">{current.run.status === "completed" ? "Nothing to report." : "Waiting for the worker to pick it up."}</p>
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
