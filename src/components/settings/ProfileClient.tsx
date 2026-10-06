"use client";

import { useClerk } from "@clerk/nextjs";
import { useState, useTransition } from "react";
import { toast } from "@/components/Toaster";
import { buttonClass } from "@/components/ui";
import type { SettingsResult } from "@/app/o/[org]/settings/actions";

const field = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[15px] outline-none focus:border-ink";

export function Section({ title, body, children }: { title: string; body?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line-soft pb-6 last:border-0">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {body && <p className="text-sm text-muted">{body}</p>}
      </div>
      {children}
    </section>
  );
}

/** A text value with Save beside it. */
export function SaveField({ label, initial, save, maxLength, disabled }: { label: string; initial: string; save: (v: string) => Promise<SettingsResult>; maxLength: number; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await save(value);
          if (r.ok) toast("success", "Saved");
          else toast("error", "Couldn’t save", r.error);
        });
      }}
      className="flex flex-col gap-1.5"
    >
      <label className="text-sm font-medium" htmlFor={`f-${label}`}>
        {label}
      </label>
      <div className="flex gap-2">
        <input id={`f-${label}`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={maxLength} disabled={disabled} className={field} />
        <button type="submit" disabled={disabled || pending || !value.trim() || value.trim() === initial} className={`${buttonClass("primary")} h-10 shrink-0 px-4`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function CalendarPrefs({ colorBy, weekStart, save }: { colorBy: "platform" | "status"; weekStart: 0 | 6; save: (p: { calendarColor?: "platform" | "status"; weekStartsOn?: 0 | 6 }) => Promise<void> }) {
  const [color, setColor] = useState(colorBy);
  const [week, setWeek] = useState(weekStart);
  const [, start] = useTransition();
  const apply = (p: { calendarColor?: "platform" | "status"; weekStartsOn?: 0 | 6 }) =>
    start(async () => {
      try {
        await save(p);
        toast("success", "Calendar preferences saved");
      } catch {
        toast("error", "Couldn’t save calendar preferences");
      }
    });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        First day of the week
        <select
          value={week}
          onChange={(e) => {
            const v = Number(e.target.value) as 0 | 6;
            setWeek(v);
            apply({ weekStartsOn: v });
          }}
          className={field}
        >
          <option value={0}>Monday</option>
          <option value={6}>Sunday</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Colour posts in the calendar by
        <select
          value={color}
          onChange={(e) => {
            const v = e.target.value as "platform" | "status";
            setColor(v);
            apply({ calendarColor: v });
          }}
          className={field}
        >
          <option value="platform">Platform</option>
          <option value="status">Status</option>
        </select>
      </label>
      <div className="flex items-center gap-3 text-sm text-muted sm:col-span-2">
        Preview:
        <span className="flex h-7 w-44 items-center overflow-hidden rounded-md border border-line bg-surface text-xs font-semibold text-ink">
          <span className="h-full w-1.5" style={{ background: color === "platform" ? "#E1306C" : "#2563EB" }} />
          <span className="px-2">{color === "platform" ? "Instagram colour" : "Status colour"}</span>
        </span>
      </div>
    </div>
  );
}

function ClerkAccount() {
  const clerk = useClerk();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
        <span>
          <b className="block text-sm">Email, password and two-step verification</b>
          <span className="text-sm text-muted">Change your sign-in email or password, turn on two-step verification, or delete your account.</span>
        </span>
        <button type="button" onClick={() => clerk.openUserProfile()} className={buttonClass("secondary", "sm")}>
          Manage account
        </button>
      </div>
      <button type="button" onClick={() => clerk.signOut({ redirectUrl: "/sign-in" })} className={`${buttonClass("secondary")} h-10 w-full`}>
        Log out
      </button>
    </div>
  );
}

export function ProfileClient(props: {
  name: string;
  email: string;
  clerk: boolean;
  colorBy: "platform" | "status";
  weekStart: 0 | 6;
  saveName: (v: string) => Promise<SettingsResult>;
  savePrefs: (p: { calendarColor?: "platform" | "status"; weekStartsOn?: 0 | 6 }) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Profile" body="How you appear to your team and on client review pages.">
        <SaveField label="Display name" initial={props.name} save={props.saveName} maxLength={60} />
      </Section>
      <Section title="Calendar" body="How calendars look for you.">
        <CalendarPrefs colorBy={props.colorBy} weekStart={props.weekStart} save={props.savePrefs} />
      </Section>
      <Section title="Account and security" body={`You sign in as ${props.email}.`}>
        {props.clerk ? <ClerkAccount /> : <p className="rounded-lg bg-subtle px-3 py-2.5 text-sm text-muted">This is a development sign-in. Email, password and two-step verification are managed by the sign-in provider once it’s connected.</p>}
      </Section>
    </div>
  );
}
