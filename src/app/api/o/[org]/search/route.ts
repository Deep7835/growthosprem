import { searchOrg } from "@/server/search";
import { listVisibleSpaces, orgContextForRoute } from "@/server/tenancy";

/** The search palette (SR-01): GET ?q= returns grouped results from the spaces the person can see. */
export async function GET(request: Request, { params }: RouteContext<"/api/o/[org]/search">) {
  const { org } = await params;
  const { ctx, status } = await orgContextForRoute(org);
  if (!ctx) return Response.json({ error: "Not allowed" }, { status });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const visible = await listVisibleSpaces(org);
  const results = await searchOrg(ctx, org, visible, q);
  return Response.json({ q, results }, { headers: { "Cache-Control": "private, no-store" } });
}
