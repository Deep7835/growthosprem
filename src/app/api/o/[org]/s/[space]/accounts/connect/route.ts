import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getGraph } from "@/lib/meta";
import { META_STATE_COOKIE } from "@/server/meta-oauth";
import { spaceContextForRoute } from "@/server/tenancy";
import { appUrl } from "@/server/url";

/** Starts "Connect Instagram and Facebook": off to Meta's login, back at /api/meta/callback. */
export async function GET(request: Request, { params }: RouteContext<"/api/o/[org]/s/[space]/accounts/connect">) {
  const { org, space } = await params;
  const { ctx, status } = await spaceContextForRoute(org, space, "accounts.connect");
  if (!ctx) return new NextResponse(null, { status });
  const accounts = new URL(`/o/${org}/s/${space}/settings/accounts`, request.url);

  const graph = getGraph();
  if (!graph) {
    accounts.searchParams.set("error", "unconfigured");
    return NextResponse.redirect(accounts);
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(META_STATE_COOKIE, JSON.stringify({ state, org, space }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/meta",
    maxAge: 600,
  });
  return NextResponse.redirect(graph.loginUrl(state, `${await appUrl()}/api/meta/callback`));
}
