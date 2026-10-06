"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { menuItem, Popover } from "@/components/Popover";
import { CHANGELOG, TAG_LABEL, type ChangeTag } from "@/lib/changelog";

const row = "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] text-ink-2 hover:bg-line-soft hover:text-ink";

/* ---------- Product updates ---------- */

const SEEN_KEY = "plotline-updates-seen";
const SEEN_EVENT = "plotline-updates-seen";
const subscribeSeen = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(SEEN_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(SEEN_EVENT, cb);
  };
};
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, CHANGELOG[0].id);
  } catch {}
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export const TAG_TONE: Record<ChangeTag, string> = {
  new: "bg-success text-white",
  improved: "bg-data text-white",
  fixed: "bg-ai text-white",
};

export function TagChip({ tag }: { tag: ChangeTag }) {
  return <span className={`rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${TAG_TONE[tag]}`}>{TAG_LABEL[tag]}</span>;
}

/** Product Updates: the latest changes in a popover above the item; "New" until opened. */
export function ProductUpdates({ allHref }: { allHref: string }) {
  // The server can't know what this browser has seen, so the badge appears after hydration.
  const seen = useSyncExternalStore(subscribeSeen, readSeen, () => CHANGELOG[0].id);
  const fresh = seen !== CHANGELOG[0].id;
  return (
    <Popover
      buttonClassName={`${row} ${fresh ? "font-medium text-ink" : ""}`}
      panelClassName="bottom-full left-0 mb-1 w-[min(340px,calc(100vw-2rem))] !p-0 overflow-hidden"
      onOpen={fresh ? markSeen : undefined}
      button={
        <>
          <Icon name="megaphone" />
          <span className="flex-1">Product updates</span>
          {fresh && <span className="rounded bg-accent px-1.5 py-px text-[10px] font-bold text-ink">New</span>}
        </>
      }
    >
      {(close) => (
        <div>
          <p className="border-b border-line-soft px-4 py-2.5 text-center text-sm font-semibold">Latest updates</p>
          <ul className="max-h-[360px] divide-y divide-line-soft overflow-y-auto">
            {CHANGELOG.slice(0, 4).map((c) => (
              <li key={c.id}>
                <Link href={`${allHref}#${c.id}`} onClick={close} className="block px-4 py-3 hover:bg-subtle">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {c.tags.map((t) => (
                      <TagChip key={t} tag={t} />
                    ))}
                    <b className="text-[13.5px]">{c.title}</b>
                  </span>
                  <span className="mt-1 line-clamp-2 text-[12.5px] text-muted">{c.body}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={allHref} onClick={close} className="block border-t border-line-soft px-4 py-2.5 text-right text-xs font-semibold text-muted hover:text-ink">
            See all changes
          </Link>
        </div>
      )}
    </Popover>
  );
}

/* ---------- Community ---------- */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}
let installEvent: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  // Captured as early as the shell loads, so the menu can offer it later.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e as InstallPrompt;
    installListeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    installListeners.forEach((l) => l());
  });
}
const subscribeInstall = (cb: () => void) => {
  installListeners.add(cb);
  return () => installListeners.delete(cb);
};
type InstallState = "ready" | "installed" | "manual";
const installState = (): InstallState => (installEvent ? "ready" : window.matchMedia("(display-mode: standalone)").matches ? "installed" : "manual");

// Links appear only when configured, so the menu never points somewhere that doesn't exist.
const COMMUNITY_URL = process.env.NEXT_PUBLIC_COMMUNITY_URL;
const AFFILIATE_URL = process.env.NEXT_PUBLIC_AFFILIATE_URL;

/** Community: the community group and affiliate programme when set up, and installing the app. */
export function CommunityMenu() {
  const install = useSyncExternalStore(subscribeInstall, installState, () => "manual" as InstallState);
  return (
    <Popover
      buttonClassName={row}
      panelClassName="bottom-full left-0 mb-1 w-64"
      button={
        <>
          <Icon name="lifebuoy" />
          <span className="flex-1">Community</span>
        </>
      }
    >
      {(close) => (
        <div className="flex flex-col">
          {COMMUNITY_URL && (
            <a href={COMMUNITY_URL} target="_blank" rel="noreferrer" onClick={close} className={menuItem}>
              <Icon name="users" /> Community group
            </a>
          )}
          {AFFILIATE_URL && (
            <a href={AFFILIATE_URL} target="_blank" rel="noreferrer" onClick={close} className={menuItem}>
              <Icon name="link" /> Affiliate programme
            </a>
          )}
          {install === "ready" ? (
            <button
              type="button"
              onClick={() => {
                close();
                void installEvent?.prompt();
              }}
              className={menuItem}
            >
              <Icon name="download" /> Install app
            </button>
          ) : (
            <p className="flex gap-2.5 px-2.5 py-2 text-[13px] text-muted">
              <Icon name="download" className="mt-0.5" />
              {install === "installed" ? "Plotline is installed on this device." : "To install Plotline, use your browser’s Install or Add to Home Screen option."}
            </p>
          )}
        </div>
      )}
    </Popover>
  );
}
