"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { PLATFORM_COLOR } from "@/lib/analytics/colors";

/** Re-renders the page every few seconds while an import or sync is running. */
export function AutoRefresh({ active, everyMs = 2000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}

export interface Option {
  key: string;
  platform: "instagram" | "facebook";
  handle: string;
  detail: string;
  followers: number | null;
  connectedHere: boolean;
  connectedIn: string | null;
}

/** Step two of connecting: choose which Pages and Instagram accounts belong to this space. */
export function AccountPicker({
  spaceName,
  options,
  pagesWithoutInstagram,
  cancelHref,
  connect,
}: {
  spaceName: string;
  options: Option[];
  pagesWithoutInstagram: string[];
  cancelHref: string;
  connect: (state: { error?: string }, form: FormData) => Promise<{ error?: string }>;
}) {
  const [state, action, pending] = useActionState(connect, {});
  const selectable = options.filter((o) => !o.connectedIn);
  const [picked, setPicked] = useState<string[]>(() => (selectable.length <= 2 ? selectable.map((o) => o.key) : []));

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border-2 border-ink bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">Choose the accounts for {spaceName}</h2>
        <p className="text-sm text-muted">Meta gave access to these. We’ll import the last 90 days of posts and numbers for each one you pick.</p>
      </div>
      <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line">
        {options.map((o) => {
          const disabled = Boolean(o.connectedIn);
          return (
            <li key={o.key}>
              <label className={`flex items-center gap-3 px-4 py-3 ${disabled ? "opacity-60" : "cursor-pointer hover:bg-subtle"}`}>
                <input
                  type="checkbox"
                  name="account"
                  value={o.key}
                  disabled={disabled}
                  checked={picked.includes(o.key)}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, o.key] : picked.filter((k) => k !== o.key))}
                  className="size-4 accent-ink"
                />
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: PLATFORM_COLOR[o.platform] }} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{o.handle}</span>
                  <span className="text-[13px] text-muted">
                    {o.detail}
                    {o.followers !== null && ` · ${o.followers.toLocaleString("en-IN")} followers`}
                  </span>
                </span>
                {o.connectedHere && <span className="text-xs font-semibold text-success-ink">Connected · picking it reconnects</span>}
                {o.connectedIn && <span className="text-xs text-muted">Already in {o.connectedIn}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {pagesWithoutInstagram.length > 0 && (
        <p className="text-[13px] text-muted">
          No Instagram account is linked to {pagesWithoutInstagram.join(", ")}. To add one, link a professional Instagram account to the Page in Meta Business Suite, then connect again.
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || picked.length === 0} className={buttonClass("primary")}>
          {pending ? "Connecting…" : picked.length ? `Connect ${picked.length} account${picked.length === 1 ? "" : "s"}` : "Connect accounts"}
        </button>
        <a href={cancelHref} className={buttonClass("ghost")}>
          Cancel
        </a>
      </div>
    </form>
  );
}

export function AccountActions({
  canConnect,
  canSync,
  status,
  busy,
  connectHref,
  sync,
  disconnect,
  handle,
  seeded,
}: {
  canConnect: boolean;
  canSync: boolean;
  status: string;
  busy: boolean;
  connectHref: string;
  sync: () => Promise<{ message: string }>;
  disconnect: () => Promise<void>;
  handle: string;
  seeded: boolean;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        setMessage(null);
        await fn();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Something went wrong.");
      }
    });

  const live = status === "active" || status === "expiring";
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {canSync && live && !seeded && (
          <button type="button" disabled={pending || busy} onClick={() => run(async () => setMessage((await sync()).message))} className={buttonClass("secondary", "sm")}>
            {busy ? "Syncing…" : "Sync now"}
          </button>
        )}
        {canConnect && (status !== "active" || seeded) && (
          <a href={connectHref} className={buttonClass(status === "reconnect_needed" || status === "expiring" ? "primary" : "secondary", "sm")}>
            {seeded ? "Connect the real account" : status === "disconnected" ? "Connect again" : "Reconnect"}
          </a>
        )}
        {canConnect && status !== "disconnected" && !confirming && (
          <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={buttonClass("ghost", "sm")}>
            {seeded ? "Remove" : "Disconnect"}
          </button>
        )}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label={`Disconnect ${handle}`} className="flex max-w-sm flex-col gap-2 rounded-lg border border-line bg-subtle p-3 text-[13px]">
          <p>
            {seeded
              ? `Remove the sample account ${handle} and its sample posts?`
              : `Disconnect ${handle}? Syncing stops and the stored token is deleted. Imported posts and numbers stay in analytics.`}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(async () => { await disconnect(); setConfirming(false); })} className={buttonClass("primary", "sm")}>
              {seeded ? "Remove sample account" : "Disconnect"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={buttonClass("ghost", "sm")}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-ink-2">
          {message}
        </p>
      )}
    </div>
  );
}
