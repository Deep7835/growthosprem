import { eq } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { getSystemDb } from "@/db";
import { mediaAssets } from "@/db/schema";
import { verifyMediaSignature } from "@/publishing/media-url";
import { serveAsset } from "@/server/media";
import { assetKey, getStorage } from "@/storage";

/**
 * Media for Meta's servers to download when publishing. No login: the signed, expiring link
 * is the permission, and it covers one file. Images go out as JPEG (all Instagram accepts),
 * at most 1440 px wide.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/media/public/[id]">) {
  const { id } = await params;
  const url = new URL(request.url);
  const assetId = z.uuid().safeParse(id);
  if (!assetId.success || !verifyMediaSignature(assetId.data, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new Response("This media link has expired or is invalid.", { status: 403 });
  }
  const db = await getSystemDb();
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId.data));
  if (!asset || asset.status !== "ready") return new Response(null, { status: 404 });

  if (asset.type !== "image") return serveAsset(asset, request, { variant: "original" });
  const original = await getStorage().getBuffer(assetKey(asset.orgId, asset.spaceId, asset.id, "original"));
  if (!original) return new Response(null, { status: 404 });
  const jpeg = await sharp(original)
    .rotate()
    .resize({ width: 1440, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
