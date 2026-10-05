"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { Channels, NotificationType } from "@/lib/notifications";
import { TypeIcon } from "./TypeIcon";

/** NT-03 and NT-04: channels per type, for the person's defaults or one space, and the daily digest. */
export function NotificationSettings(props: {
  org: string;
  email: string;
  scope: string;
  spaces: { id: string; name: string; custom: boolean }[];
  custom: boolean;
  types: { id: NotificationType; label: string; hint: string }[];
  prefs: Record<NotificationType, Channels>;
  digest: boolean;
  timeZone: string | null;
  emailReady: boolean;
  save: (types: Record<string, Channels>) => Promise<void>;
  resetScope: (() => Promise<void>) | null;
  applyToOthers: (() => Promise<void>) | null;
  setDigest: (on: boolean, timeZone: string) => Promise<void>;
}) {
  const [prefs, setPrefs] = useState(props.prefs);
  // Take the server's table when it changes (Use default, Apply to other spaces).
  const incoming = JSON.stringify(props.prefs);
  const [seen, setSeen] = useState(incoming);
  if (incoming !== seen) {
    setSeen(incoming);
    setPrefs(props.prefs);
  }
  const [digest, setDigestOn] = useState(props.digest);
  const [status, setStatus] = useState("");
  const [digestStatus, setDigestStatus] = useState("");
  const [pending, start] = useTransition();
  const base = `/o/${props.org}/notifications/settings`;
  const spaceName = props.spaces.find((s) => s.id === props.scope)?.name;

  const run = (fn: () => Promise<void>, done: string, show = setStatus) =>
    start(async () => {
      show("Saving…");
      try {
        await fn();
        show(done);
      } catch (e) {
        show(e instanceof Error ? e.message : "Couldn’t save. Try again.");
      }
    });

  const toggle = (type: NotificationType, channel: keyof Channels, on: boolean) => {
    const next = { ...prefs, [type]: { ...prefs[type], [channel]: on } };
    setPrefs(next);
    run(() => props.save(next), props.scope === "default" ? "Saved." : `Saved for ${spaceName}.`);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 pb-14">
      <div>
        <Link href={`/o/${props.org}/notifications`} className="text-sm font-semibold text-muted hover:text-ink">
          ← Notifications
        </Link>
        <h1 className="mt-1 font-display text-3xl font-bold">Notification settings</h1>
        <p className="text-sm text-muted">Choose what reaches you in Growth OS and by email at {props.email}.</p>
      </div>

      <nav aria-label="Settings for" className="flex flex-wrap gap-1.5">
        {[{ id: "default", name: "Default for all spaces", custom: false }, ...props.spaces].map((s) => {
          const active = s.id === props.scope;
          return (
            <Link
              key={s.id}
              href={s.id === "default" ? base : `${base}?scope=${s.id}`}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${active ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:bg-subtle"}`}
            >
              {s.name}
              {s.custom && <span className={`rounded-full px-1.5 text-[10px] uppercase tracking-wide ${active ? "bg-white/20" : "bg-subtle text-muted"}`}>Custom</span>}
            </Link>
          );
        })}
      </nav>

      <section aria-labelledby="types-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="types-heading" className="font-semibold">
              {props.scope === "default" ? "Your defaults" : spaceName}
            </h2>
            <p className="text-sm text-muted">
              {props.scope === "default"
                ? "Every space follows these unless you change it."
                : props.custom
                  ? `${spaceName} has its own settings.`
                  : `${spaceName} follows your defaults. Change anything to give it its own settings.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span aria-live="polite" className="text-sm text-muted">
              {status}
            </span>
            {props.resetScope && props.custom && (
              <button type="button" disabled={pending} onClick={() => run(props.resetScope!, `${spaceName} follows your defaults again.`)} className={buttonClass("ghost", "sm")}>
                Use default
              </button>
            )}
            {props.applyToOthers && props.spaces.length > 1 && (
              <button type="button" disabled={pending} onClick={() => run(props.applyToOthers!, "Applied to your other spaces.")} className={buttonClass("secondary", "sm")}>
                Apply to other spaces
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Type
                </th>
                <th scope="col" className="w-24 px-2 py-2.5 text-center font-semibold">
                  In-app
                </th>
                <th scope="col" className="w-24 px-2 py-2.5 text-center font-semibold">
                  Email
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {props.types.map((t) => {
                const locked = t.id === "action_required";
                return (
                  <tr key={t.id}>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="flex items-center gap-3">
                        <TypeIcon type={t.id} size={26} />
                        <span>
                          <span className="block font-semibold">{t.label}</span>
                          <span className="block text-[13px] text-muted">{t.hint}</span>
                        </span>
                      </span>
                    </th>
                    <td className="px-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${t.label} in Growth OS`}
                        checked={locked || prefs[t.id].inApp}
                        disabled={locked}
                        title={locked ? "Action required always shows in Growth OS" : undefined}
                        onChange={(e) => toggle(t.id, "inApp", e.target.checked)}
                        className="size-4"
                      />
                    </td>
                    <td className="px-2 text-center">
                      <input type="checkbox" aria-label={`${t.label} by email`} checked={prefs[t.id].email} onChange={(e) => toggle(t.id, "email", e.target.checked)} className="size-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Action required always shows in Growth OS. A failed post emails you only if it’s still failed 30 minutes later.
          {!props.emailReady && " Email sending isn’t set up on this server yet, so nothing is emailed for now."}
        </p>
      </section>

      <section aria-labelledby="digest-heading" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
        <h2 id="digest-heading" className="font-semibold">
          Daily digest
        </h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={digest}
            onChange={(e) => {
              const on = e.target.checked;
              setDigestOn(on);
              const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
              run(() => props.setDigest(on, zone), on ? "Digest on: one email at 9 AM with anything unread." : "Digest off.", setDigestStatus);
            }}
            className="mt-0.5 size-4"
          />
          <span>
            Email me a summary of unread notifications every morning at 9 AM
            <span className="block text-[13px] text-muted">
              {props.timeZone ? `Your time zone: ${props.timeZone}.` : "Uses this browser’s time zone."} No email on days with nothing unread.
            </span>
          </span>
        </label>
        <p aria-live="polite" className="min-h-5 pl-7 text-[13px] text-muted">
          {digestStatus}
        </p>
      </section>
    </div>
  );
}
