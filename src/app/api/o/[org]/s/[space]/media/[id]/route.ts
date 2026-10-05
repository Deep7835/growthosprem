import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrg } from "@/db";
import { mediaAssets } from "@/db/schema";
import { serveAsset } from "@/server/media";
import { spaceContextForRoute } from "@/server/tenancy";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/o/[org]/s/[space]/media/[id]">) {
  const { org, space, id } = await params;
  const { ctx, status } = await spaceContextForRoute(org, space, "content.view");
  if (!ctx) return new Response(null, { status });
  const assetId = z.uuid().safeParse(id);
  if (!assetId.success) return new Response(null, { status: 404 });
  const [asset] = await withOrg(ctx.org.id, (tx) =>
    tx.select().from(mediaAssets).where(and(eq(mediaAssets.id, assetId.data), eq(mediaAssets.spaceId, ctx.space.id))),
  );
  if (!asset || asset.status !== "ready") return new Response(null, { status: 404 });
  const q = request.nextUrl.searchParams;
  return serveAsset(asset, request, { variant: q.get("v") === "thumb" ? "thumb" : "original", download: q.has("download") });
}
