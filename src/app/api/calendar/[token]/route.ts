import { renderFeed } from "@/server/calendar-feed";
import { appUrl } from "@/server/url";

/** The calendar feed (Settings › Integrations): /api/calendar/<token>.ics, no sign-in, token only. */
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const { token } = await params;
  const ics = await renderFeed(token.replace(/\.ics$/, ""), await appUrl());
  if (!ics) return new Response("This calendar link isn’t active.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": 'inline; filename="plotline.ics"' } });
}
