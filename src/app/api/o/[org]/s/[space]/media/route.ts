// Upload (MD-02): the raw file is the request body, streamed to storage, then processed.
import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withOrg } from "@/db";
import { mediaAssets, mediaFolders } from "@/db/schema";
import { ACCEPTED, STORAGE_LIMIT_BYTES } from "@/lib/media-types";
import { looksLike, processImage } from "@/server/media";
import { spaceContextForRoute } from "@/server/tenancy";
import { TooLargeError, assetKey, assetPrefix, getStorage } from "@/storage";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

function cleanFilename(name: string | null) {
  const base = (name ?? "upload").split(/[\\/]/).pop() ?? "upload";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "upload";
}

export async function POST(request: NextRequest, { params }: RouteContext<"/api/o/[org]/s/[space]/media">) {
  const { org, space } = await params;
  const { ctx, status } = await spaceContextForRoute(org, space, "content.edit");
  if (!ctx) return fail(status, status === 401 ? "Sign in to upload." : "You can’t upload to this space.");
  if (!request.body) return fail(400, "No file was sent.");

  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const rule = ACCEPTED[mime];
  if (!rule) return fail(415, "This file type isn’t supported. Use JPG, PNG, WebP, GIF, MP4, MOV, WebM or PDF.");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > rule.maxBytes) return fail(413, new TooLargeError(rule.maxBytes).message);

  const q = request.nextUrl.searchParams;
  const folderId = z.uuid().nullable().catch(null).parse(q.get("folderId"));
  const num = (k: string) => z.coerce.number().positive().max(100_000).nullable().catch(null).parse(q.get(k));
  const filename = cleanFilename(q.get("filename"));

  const asset = await withOrg(ctx.org.id, async (tx) => {
    const [{ used }] = await tx.select({ used: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)::bigint` }).from(mediaAssets);
    if (Number(used) + declared > STORAGE_LIMIT_BYTES) return null;
    const folder = folderId
      ? (await tx.select().from(mediaFolders).where(and(eq(mediaFolders.id, folderId), eq(mediaFolders.spaceId, ctx.space.id))))[0]
      : undefined;
    const [row] = await tx
      .insert(mediaAssets)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        folderId: folder?.id ?? null,
        type: rule.type,
        filename,
        mimeType: mime,
        storageKey: "pending",
        uploadedBy: ctx.user.id,
      })
      .returning();
    const storageKey = assetKey(ctx.org.id, ctx.space.id, row.id, "original");
    await tx.update(mediaAssets).set({ storageKey }).where(eq(mediaAssets.id, row.id));
    return { ...row, storageKey };
  });
  if (!asset) return fail(413, "Your storage is full. Delete unused media or upgrade your plan.");

  const storage = getStorage();
  const update = (values: Partial<typeof mediaAssets.$inferInsert>) =>
    withOrg(ctx.org.id, (tx) => tx.update(mediaAssets).set(values).where(eq(mediaAssets.id, asset.id)).returning());

  try {
    const size = await storage.putStream(asset.storageKey, request.body, rule.maxBytes);
    await update({ status: "processing", sizeBytes: size });
    const original = (await storage.getBuffer(asset.storageKey))!;
    if (rule.type === "image") {
      const { width, height, thumb } = await processImage(original);
      const thumbKey = assetKey(ctx.org.id, ctx.space.id, asset.id, "thumb");
      await storage.putBuffer(thumbKey, thumb);
      const [ready] = await update({ status: "ready", width, height, thumbKey });
      return NextResponse.json({ asset: ready });
    }
    if (!looksLike(rule.type, original.subarray(0, 16), mime)) throw new Error("The file’s contents don’t match its type.");
    // Video size and length are read in the browser; the poster frame arrives separately.
    const [ready] = await update({ status: "ready", width: num("width"), height: num("height"), durationSeconds: num("duration") });
    return NextResponse.json({ asset: ready });
  } catch (e) {
    // The person sees the error in their upload list, so a rejected file leaves nothing behind.
    await storage.deletePrefix(assetPrefix(ctx.org.id, ctx.space.id, asset.id));
    await withOrg(ctx.org.id, (tx) => tx.delete(mediaAssets).where(eq(mediaAssets.id, asset.id)));
    if (e instanceof TooLargeError) return fail(413, e.message);
    return fail(422, e instanceof Error ? e.message : "Processing failed.");
  }
}
