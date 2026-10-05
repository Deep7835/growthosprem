// A video's poster frame, captured in the browser at upload (sharp can't read video).
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withOrg } from "@/db";
import { mediaAssets } from "@/db/schema";
import { processImage } from "@/server/media";
import { spaceContextForRoute } from "@/server/tenancy";
import { assetKey, getStorage } from "@/storage";

const MAX = 5 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: RouteContext<"/api/o/[org]/s/[space]/media/[id]/poster">) {
  const { org, space, id } = await params;
  const { ctx, status } = await spaceContextForRoute(org, space, "content.edit");
  if (!ctx) return new Response(null, { status });
  const assetId = z.uuid().safeParse(id);
  if (!assetId.success) return new Response(null, { status: 404 });
  const [asset] = await withOrg(ctx.org.id, (tx) =>
    tx.select().from(mediaAssets).where(and(eq(mediaAssets.id, assetId.data), eq(mediaAssets.spaceId, ctx.space.id))),
  );
  if (!asset || asset.type !== "video") return new Response(null, { status: 404 });

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX) return NextResponse.json({ error: "Poster too large." }, { status: 413 });
  try {
    const { thumb } = await processImage(body);
    const thumbKey = assetKey(ctx.org.id, ctx.space.id, asset.id, "thumb");
    await getStorage().putBuffer(thumbKey, thumb);
    await withOrg(ctx.org.id, (tx) => tx.update(mediaAssets).set({ thumbKey }).where(eq(mediaAssets.id, asset.id)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The poster isn’t a readable image." }, { status: 422 });
  }
}
