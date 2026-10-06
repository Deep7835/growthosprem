"use client";

import { useEffect, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";

type State = "checking" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** NT-03: turns browser notifications on or off for this browser. */
export function PushToggle({
  publicKey,
  save,
  remove,
  test,
}: {
  publicKey: string | null;
  save: (sub: unknown, userAgent: string) => Promise<void>;
  remove: (endpoint: string) => Promise<void>;
  test: (endpoint: string) => Promise<boolean>;
}) {
  const [state, setState] = useState<State>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      let found: string | null = null;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = "unsupported";
      else if (!publicKey) next = "unconfigured";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        found = sub?.endpoint ?? null;
        next = sub ? "on" : "off";
      }
      if (!cancelled) {
        setEndpoint(found);
        setState(next);
      }
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const turnOn = () =>
    start(async () => {
      setMessage("");
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          setMessage(permission === "denied" ? "" : "Allow notifications when the browser asks to turn them on.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) }));
        await save(sub.toJSON(), navigator.userAgent);
        setEndpoint(sub.endpoint);
        setState("on");
        setMessage("On for this browser.");
      } catch (e) {
        setMessage(e instanceof Error ? `Couldn’t turn them on: ${e.message}` : "Couldn’t turn them on.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await remove(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setState("off");
      setMessage("Off for this browser.");
    });

  const copy: Record<State, string> = {
    checking: "Checking this browser…",
    unsupported: "This browser can’t show notifications from websites.",
    unconfigured: "Browser notifications aren’t set up on this server yet (VAPID keys).",
    denied: "Notifications are blocked for this site. Allow them in the browser’s site settings, then reload.",
    off: "Get a notification on this device even when Plotline isn’t open.",
    on: "On for this browser. The Browser column above decides which types arrive.",
  };

  return (
    <section aria-labelledby="push-heading" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <h2 id="push-heading" className="font-semibold">
        Browser notifications
      </h2>
      <p className="text-sm text-muted">{copy[state]}</p>
      <div className="flex flex-wrap items-center gap-2">
        {state === "off" && (
          <button type="button" disabled={pending} onClick={turnOn} className={buttonClass("primary", "sm")}>
            Turn on for this browser
          </button>
        )}
        {state === "on" && (
          <>
            <button
              type="button"
              disabled={pending || !endpoint}
              onClick={() => start(async () => setMessage((await test(endpoint!)) ? "Test sent. It should appear in a moment." : "The test couldn’t be delivered. Try turning it off and on."))}
              className={buttonClass("secondary", "sm")}
            >
              Send a test
            </button>
            <button type="button" disabled={pending} onClick={turnOff} className={buttonClass("ghost", "sm")}>
              Turn off
            </button>
          </>
        )}
        <span aria-live="polite" className="text-[13px] text-muted">
          {pending ? "Working…" : message}
        </span>
      </div>
    </section>
  );
}
