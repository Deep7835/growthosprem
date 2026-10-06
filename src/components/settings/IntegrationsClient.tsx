"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { PlatformLogo, buttonClass } from "@/components/ui";
import { Section } from "./ProfileClient";

type Feed = { includeTasks: boolean; lastFetchedAt: string | null; createdAt: string } | null;

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-success-bg text-success-ink" : "bg-line-soft text-muted"}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${on ? "bg-success" : "bg-faint"}`} />
      {children}
    </span>
  );
}

function CalendarFeed({ feed, create, setTasks, turnOff }: { feed: Feed; create: (tasks: boolean) => Promise<{ url: string }>; setTasks: (tasks: boolean) => Promise<void>; turnOff: () => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [tasks, setTasksState] = useState(feed?.includeTasks ?? true);
  const [pending, start] = useTransition();
  const make = () =>
    start(async () => {
      try {
        setUrl((await create(tasks)).url);
      } catch {
        toast("error", "Couldn’t make the link");
      }
    });
  const fetched = feed?.lastFetchedAt ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(feed.lastFetchedAt)) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-data-bg text-data">
          <Icon name="calendar" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <b className="text-[15px]">Calendar feed</b>
            <Chip on={Boolean(feed)}>{feed ? "On" : "Off"}</Chip>
          </span>
          <span className="block text-sm text-muted">
            See planned posts{tasks ? " and tasks due" : ""} from every space you can see in Google Calendar, Outlook or Apple Calendar. Calendars refresh it themselves, usually every few hours.
          </span>
        </span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={tasks}
          onChange={(e) => {
            setTasksState(e.target.checked);
            if (feed) start(() => setTasks(e.target.checked));
          }}
          className="accent-ink"
        />
        Include tasks with a due date
      </label>
      {url ? (
        <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3">
          <p className="text-sm font-medium">Your private link. Copy it now: for safety it’s only shown once.</p>
          <div className="flex gap-2">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Calendar feed link" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-xs" />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                toast("success", "Link copied");
              }}
              className={buttonClass("primary", "sm")}
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-muted">
            Google Calendar: Other calendars › + › From URL. Outlook: Add calendar › Subscribe from web. Apple Calendar: File › New Calendar Subscription. Anyone with the link can see these dates, so don’t share it.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={make} className={buttonClass(feed ? "secondary" : "primary", "sm")}>
            {pending ? "Working…" : feed ? "Make a new link" : "Turn on and get the link"}
          </button>
          {feed && (
            <button type="button" disabled={pending} onClick={() => start(() => turnOff())} className={`${buttonClass("ghost", "sm")} hover:text-danger`}>
              Turn off
            </button>
          )}
          {feed && <span className="text-xs text-muted">{fetched ? `Last read by a calendar ${fetched}.` : "Not read by a calendar yet."} A new link stops the old one.</span>}
        </div>
      )}
    </div>
  );
}

const SOON = [
  ["Google Drive", "Pick files from Drive when adding media to a post."],
  ["Canva", "Bring Canva designs into a post’s media."],
  ["Claude and ChatGPT", "Plan and edit content from your AI assistant’s chat."],
] as const;

export function IntegrationsClient(props: {
  org: string;
  firstSpace: string | null;
  feed: Feed;
  create: (tasks: boolean) => Promise<{ url: string }>;
  setTasks: (tasks: boolean) => Promise<void>;
  turnOff: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Essentials" body="Connected to your Plotline account only; your teammates set up their own.">
        <CalendarFeed feed={props.feed} create={props.create} setTasks={props.setTasks} turnOff={props.turnOff} />
        <div className="grid gap-3 sm:grid-cols-3">
          {SOON.map(([name, body]) => (
            <div key={name} className="flex flex-col gap-1.5 rounded-xl border border-dashed border-line p-4">
              <span className="flex items-center justify-between gap-2">
                <b className="text-sm">{name}</b>
                <Chip on={false}>Not available yet</Chip>
              </span>
              <span className="text-[13px] text-muted">{body}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Social profiles" body="Social accounts are connected inside each space, so access, permissions and profile choices stay with the right brand.">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle p-4">
          <span className="flex gap-2">
            <PlatformLogo platform="instagram" size={24} />
            <PlatformLogo platform="facebook" size={24} />
            <PlatformLogo platform="linkedin" size={24} />
          </span>
          <span className="flex-1 text-sm text-muted">Instagram and Facebook connect through Meta’s login. LinkedIn is next.</span>
          {props.firstSpace && (
            <Link href={`/o/${props.org}/s/${props.firstSpace}/settings/accounts`} className={buttonClass("primary", "sm")}>
              Manage
            </Link>
          )}
        </div>
      </Section>
    </div>
  );
}
