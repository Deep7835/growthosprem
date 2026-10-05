import "server-only";
import { mediaAssets } from "@/db/schema";
import { assetKey, getStorage } from "@/storage";

export { looksLike, processImage } from "./media-checks";

type Asset = typeof mediaAssets.$inferSelect;

export const mediaUrl = (org: string, space: string, assetId: string, variant: "thumb" | "original" = "thumb") =>
  `/api/o/${org}/s/${space}/media/${assetId}${variant === "thumb" ? "?v=thumb" : ""}`;

/** Streams an asset with byte-range support, for the library, the content panel and the review page. */
export async function serveAsset(asset: Asset, request: Request, opts: { variant: "thumb" | "original"; download?: boolean }) {
  const useThumb = opts.variant === "thumb" && asset.thumbKey;
  const key = useThumb ? asset.thumbKey! : assetKey(asset.orgId, asset.spaceId, asset.id, "original");
  const contentType = useThumb ? "image/webp" : asset.mimeType;
  const storage = getStorage();
  const whole = await storage.getStream(key);
  if (!whole) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${opts.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
  });
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (match && !useThumb) {
    await whole.stream.cancel();
    const size = whole.size;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const part = await storage.getStream(key, { start, end });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(part!.stream, { status: 206, headers });
  }
  headers.set("Content-Length", String(whole.size));
  return new Response(whole.stream, { headers });
}
