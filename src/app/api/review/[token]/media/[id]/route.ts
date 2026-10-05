// Media for the public review page: only assets attached to posts in this share link.
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrg } from "@/db";
import { contentMedia, mediaAssets, shareLinkItems } from "@/db/schema";
import { serveAsset } from "@/server/media";
import { resolveShareLink } from "@/server/review";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/review/[token]/media/[id]">) {
  const { token, id } = await params;
  const link = await resolveShareLink(token);
  const assetId = z.uuid().safeParse(id);
  if (link.state !== "ok" || !assetId.success) return new Response(null, { status: 404 });
  const [row] = await withOrg(link.link.orgId, (tx) =>
    tx
      .select({ asset: mediaAssets })
      .from(mediaAssets)
      .innerJoin(contentMedia, eq(contentMedia.mediaAssetId, mediaAssets.id))
      .innerJoin(shareLinkItems, and(eq(shareLinkItems.contentItemId, contentMedia.contentItemId), eq(shareLinkItems.shareLinkId, link.link.id)))
      .where(eq(mediaAssets.id, assetId.data))
      .limit(1),
  );
  if (!row || row.asset.status !== "ready") return new Response(null, { status: 404 });
  const q = request.nextUrl.searchParams;
  return serveAsset(row.asset, request, { variant: q.get("v") === "thumb" ? "thumb" : "original", download: q.has("download") });
}
