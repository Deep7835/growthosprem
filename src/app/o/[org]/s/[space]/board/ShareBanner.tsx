import Link from "next/link";
import { headers } from "next/headers";
import { buttonClass } from "@/components/ui";
import { CopyButton } from "./CopyButton";

const ERRORS: Record<string, string> = {
  "nothing-in-review": "Nothing is waiting for client review. Move posts to “Client review” first, then share.",
  "no-review-status": "This space has no status marked for client review. Add one in space settings.",
};

export async function ShareBanner({ query }: { query: Record<string, string | string[] | undefined> }) {
  if (typeof query.share === "string") {
    return (
      <p role="alert" className="rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
        {ERRORS[query.share] ?? "Could not create the review link."}
      </p>
    );
  }
  if (typeof query.shared !== "string") return null;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = `${origin}/review/${query.shared}`;
  const text = `Hi! Here are this week's posts for your review: ${url}`;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-success-bg px-4 py-3 text-success-ink">
      <span className="flex-1 text-sm font-semibold">
        Review link ready for {query.count} posts. Your client can open it on their phone without an account.
      </span>
      <CopyButton value={url} />
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className={buttonClass("secondary", "sm")}
      >
        Share on WhatsApp
      </a>
      <Link href={`/review/${query.shared}`} target="_blank" className={buttonClass("primary", "sm")}>
        Open review page
      </Link>
    </div>
  );
}
