import { AccountActions, AccountPicker, AutoRefresh } from "@/components/accounts/AccountsClient";
import { PLATFORM_COLOR } from "@/lib/analytics/colors";
import { metaMode } from "@/lib/meta";
import { daysLeft } from "@/lib/meta/health";
import { PLATFORM_NAMES, type Platform } from "@/lib/placements";
import { listSpaceAccounts, pickerOptions } from "@/server/meta";
import { getSpaceContext } from "@/server/tenancy";
import { connectSelected, disconnect, syncNow } from "./actions";

export const metadata = { title: "Accounts" };

const ERRORS: Record<string, string> = {
  denied: "Connection cancelled. Nothing was changed.",
  failed: "Meta didn’t complete the connection. Try again in a minute.",
  "no-pages": "Your Facebook login has no Pages this app can use. Make sure you’re an admin of the Page, then allow access to it when Meta asks.",
  unconfigured: "Instagram and Facebook aren’t set up for this workspace yet. An admin needs to add the Meta app keys.",
};

const ACTIONS: Record<string, string> = {
  connected: "connected",
  disconnected: "disconnected",
  history_imported: "Imported the last 90 days",
  reconnect_needed: "Needs reconnecting",
  token_expiring: "Access expires soon",
};

function ago(date: Date | null, now: number) {
  if (!date) return "never";
  const minutes = Math.max(0, Math.round((now - date.getTime()) / 60000));
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (minutes < 60) return f.format(-minutes, "minute");
  if (minutes < 60 * 48) return f.format(-Math.round(minutes / 60), "hour");
  return f.format(-Math.round(minutes / 1440), "day");
}

function Health({ status, expiresAt, now, reason }: { status: string; expiresAt: Date | null; now: number; reason: string | null }) {
  const [label, tone] =
    status === "active"
      ? ["Active", "bg-success-bg text-success-ink"]
      : status === "expiring" && expiresAt
        ? [`Expires in ${daysLeft(expiresAt, new Date(now))} day${daysLeft(expiresAt, new Date(now)) === 1 ? "" : "s"}`, "bg-warn-bg text-warn-ink"]
        : status === "reconnect_needed"
          ? ["Reconnect needed", "bg-danger-bg text-danger"]
          : ["Disconnected", "bg-line-soft text-ink-2"];
  return (
    <span title={reason ?? undefined} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export default async function AccountsPage({ params, searchParams }: PageProps<"/o/[org]/s/[space]/settings/accounts">) {
  const { org, space } = await params;
  const query = await searchParams;
  const ctx = await getSpaceContext(org, space);
  const now = ctx.requestTime;
  const canConnect = ctx.can("accounts.connect");
  const mode = metaMode();
  const base = `/o/${org}/s/${space}/settings/accounts`;
  const connectHref = `/api/o/${org}/s/${space}/accounts/connect`;

  const pick = typeof query.pick === "string" && canConnect ? await pickerOptions(ctx, query.pick) : null;
  const error = typeof query.error === "string" ? (ERRORS[query.error] ?? ERRORS.failed) : null;
  const { accounts, log } = await listSpaceAccounts(ctx);
  const working = accounts.some((a) => a.syncState && a.syncState !== "import_failed");
  const handles = new Map(accounts.map((a) => [a.id, a.handle]));

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh active={working} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Accounts</h2>
          <p className="max-w-xl text-sm text-muted">
            The social accounts {ctx.space.name} posts to. Tokens are stored encrypted, numbers sync every hour, and access is checked daily.
          </p>
        </div>
        {canConnect && mode !== "unconfigured" && (
          <a href={connectHref} className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-2">
            Connect Instagram and Facebook
          </a>
        )}
      </div>

      {mode === "sample" && (
        <p className="rounded-xl border border-dashed border-faint px-4 py-3 text-sm text-ink-2">
          <strong>Sample mode.</strong> Meta app keys aren’t set (<code>META_APP_ID</code>, <code>META_APP_SECRET</code>), so connecting skips Meta’s login and uses
          generated sample accounts. The import, syncs and token checks run exactly as they will with real accounts.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {typeof query.pick === "string" && canConnect && !pick && (
        <p role="alert" className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
          That connection timed out after 15 minutes. Choose “Connect Instagram and Facebook” to start again.
        </p>
      )}
      {query.connected && !working && accounts.some((a) => a.lastSyncedAt && (a.status === "active" || a.status === "expiring")) && (
        <p role="status" className="rounded-xl bg-success-bg px-4 py-3 text-sm text-success-ink">
          Connected. Your last 90 days are in: see the <a className="font-semibold underline" href={`/o/${org}/s/${space}/audit`}>first audit</a> and{" "}
          <a className="font-semibold underline" href={`/o/${org}/s/${space}/analytics`}>analytics</a>.
        </p>
      )}

      {pick && (
        <AccountPicker
          spaceName={ctx.space.name}
          options={pick.options}
          pagesWithoutInstagram={pick.pagesWithoutInstagram}
          cancelHref={base}
          connect={connectSelected.bind(null, org, space, query.pick as string)}
        />
      )}

      {(["instagram", "facebook", "linkedin"] as Platform[]).map((platform) => {
        const list = accounts.filter((a) => a.platform === platform);
        return (
          <section key={platform} aria-label={PLATFORM_NAMES[platform]} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <header className="flex items-center gap-2 border-b border-line-soft bg-subtle px-4 py-2.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: PLATFORM_COLOR[platform] }} />
              <h3 className="font-semibold">{PLATFORM_NAMES[platform]}</h3>
            </header>
            {platform === "linkedin" ? (
              <p className="px-4 py-4 text-sm text-muted">LinkedIn connection arrives in a later milestone.</p>
            ) : list.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                <p className="text-sm text-muted">
                  {platform === "instagram"
                    ? "Not connected. Instagram professional accounts connect through the Facebook Page they’re linked to."
                    : "Not connected."}
                </p>
                {canConnect && mode !== "unconfigured" && (
                  <a href={connectHref} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[13px] font-semibold hover:bg-subtle">
                    Connect {PLATFORM_NAMES[platform]}
                  </a>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {list.map((a) => {
                  const seeded = a.isDemo && !a.accessTokenEnc && a.status !== "disconnected";
                  const progress = a.syncProgress;
                  return (
                    <li key={a.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="text-[15px]">{a.handle}</strong>
                          {seeded ? (
                            <span className="rounded-full border border-dashed border-faint px-2 py-0.5 text-[11px] font-semibold text-muted">Sample data</span>
                          ) : (
                            <Health status={a.status} expiresAt={a.tokenExpiresAt} now={now} reason={a.statusReason} />
                          )}
                          {a.isDemo && !seeded && <span className="text-[11px] text-muted">sample connection</span>}
                        </span>
                        <span className="text-[13px] text-muted">
                          {seeded
                            ? "Seeded so the audit and analytics have something to show. Connecting the real account replaces it."
                            : [
                                platform === "instagram" ? "Professional account" : "Facebook Page",
                                a.status === "disconnected" ? "History kept" : `Synced ${ago(a.lastSyncedAt, now)}`,
                              ].join(" · ")}
                        </span>
                        {a.status === "reconnect_needed" && a.statusReason && <span className="text-[13px] text-danger">{a.statusReason}</span>}
                        {a.syncState && a.syncState !== "import_failed" && (
                          <div className="mt-1 flex w-72 max-w-full flex-col gap-1" role="status">
                            <span className="text-xs font-semibold text-ink-2">
                              {a.syncState === "queued" || a.syncState === "import_queued"
                                ? "Waiting to start…"
                                : a.syncState === "importing"
                                  ? progress?.total
                                    ? `Importing the last 90 days: ${progress.done} of ${progress.total} posts`
                                    : "Importing the last 90 days: finding posts…"
                                  : "Syncing…"}
                            </span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                              <span
                                className="block h-full bg-ink transition-[width]"
                                style={{ width: `${progress?.total ? Math.max(4, (progress.done / progress.total) * 100) : 4}%` }}
                              />
                            </span>
                          </div>
                        )}
                        {a.syncState === "import_failed" && (
                          <span className="text-[13px] text-danger">The import stopped after three tries. Use Sync now to try again.</span>
                        )}
                      </div>
                      <AccountActions
                        canConnect={canConnect && mode !== "unconfigured"}
                        canSync={ctx.can("analytics.view")}
                        status={a.status}
                        busy={Boolean(a.syncState && a.syncState !== "import_failed")}
                        connectHref={connectHref}
                        sync={syncNow.bind(null, org, space, a.id)}
                        disconnect={disconnect.bind(null, org, space, a.id)}
                        handle={a.handle}
                        seeded={seeded}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {log.length > 0 && (
        <section aria-label="Account activity" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Recent activity</h3>
          <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
            {log.map((l) => (
              <li key={l.id}>
                {l.actorKind === "user" ? `${l.actorLabel} ${ACTIONS[l.action] ?? l.action} ${handles.get(l.targetId) ?? "an account"}` : `${handles.get(l.targetId) ?? "An account"}: ${ACTIONS[l.action] ?? l.action}`}
                {l.action === "history_imported" && typeof (l.after as { posts?: number })?.posts === "number" && ` (${(l.after as { posts: number }).posts} posts)`}
                <span className="text-muted"> · {ago(l.at, now)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
