import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getGraph, GraphError } from "@/lib/meta";
import { createOAuthSession } from "@/server/meta";
import { META_STATE_COOKIE, checkState } from "@/server/meta-oauth";
import { spaceContextForRoute } from "@/server/tenancy";
import { appUrl } from "@/server/url";

/** Meta sends the person back here after login. The redirect URI registered in the Meta app. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const target = checkState(jar.get(META_STATE_COOKIE)?.value, url.searchParams.get("state"));
  jar.delete({ name: META_STATE_COOKIE, path: "/api/meta" });
  if (!target) return new NextResponse("This sign-in link has expired or was opened in another browser. Start again from Settings › Accounts.", { status: 400 });

  const { ctx, status } = await spaceContextForRoute(target.org, target.space, "accounts.connect");
  if (!ctx) return new NextResponse(null, { status });
  const accounts = new URL(`/o/${encodeURIComponent(target.org)}/s/${encodeURIComponent(target.space)}/settings/accounts`, request.url);
  const back = (params: Record<string, string>) => {
    for (const [k, v] of Object.entries(params)) accounts.searchParams.set(k, v);
    return NextResponse.redirect(accounts);
  };

  const code = url.searchParams.get("code");
  if (!code) return back({ error: url.searchParams.get("error") === "access_denied" ? "denied" : "failed" });
  const graph = getGraph();
  if (!graph) return back({ error: "unconfigured" });

  try {
    const { userToken } = await graph.exchangeCode(code, `${await appUrl()}/api/meta/callback`);
    const pages = await graph.listPages(userToken);
    if (pages.length === 0) return back({ error: "no-pages" });
    return back({ pick: await createOAuthSession(ctx, pages) });
  } catch (error) {
    console.error("[meta] login callback failed", error instanceof GraphError ? `${error.code}: ${error.message}` : error);
    return back({ error: "failed" });
  }
}
