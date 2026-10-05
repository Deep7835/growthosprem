"use client";

import { buttonClass } from "@/components/ui";

/** OV-08: say what failed and offer a retry, never just "Something went wrong". */
export default function CalendarError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="m-6 flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-display text-xl font-bold">The calendar didn’t load</h2>
      <p className="text-sm text-muted">
        We couldn’t read this period’s posts and tasks{error.digest ? ` (reference ${error.digest})` : ""}. Your content is safe. Try again, or pick another period.
      </p>
      <button type="button" onClick={reset} className={buttonClass("primary")}>
        Retry
      </button>
    </div>
  );
}
