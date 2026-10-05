import { getSystemDb } from "@/db";
import { listLibrary } from "@/db/media";
import { MediaLibrary } from "@/components/media/MediaLibrary";
import { STORAGE_LIMIT_BYTES } from "@/lib/media-types";
import { getSpaceContext } from "@/server/tenancy";
import { createFolder, deleteAsset, updateAsset } from "./actions";

export const metadata = { title: "Media" };

export default async function MediaPage({ params }: PageProps<"/o/[org]/s/[space]/media">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const library = await listLibrary(await getSystemDb(), ctx.org.id, ctx.space.id);

  return (
    <MediaLibrary
      org={org}
      space={space}
      folders={library.folders.map((f) => ({ id: f.id, name: f.name, isBrandAssets: f.isBrandAssets }))}
      assets={library.assets.map((a) => ({
        id: a.id,
        type: a.type,
        source: a.source,
        status: a.status,
        filename: a.filename,
        sizeBytes: a.sizeBytes,
        width: a.width,
        height: a.height,
        durationSeconds: a.durationSeconds,
        tags: a.tags,
        folderId: a.folderId,
        createdAt: a.createdAt.toISOString(),
        hasThumb: Boolean(a.thumbKey),
        error: a.error,
        usedIn: a.usedIn,
      }))}
      usedBytes={library.usedBytes}
      limitBytes={STORAGE_LIMIT_BYTES}
      canEdit={ctx.can("content.edit")}
      createFolder={createFolder.bind(null, org, space)}
      updateAsset={updateAsset.bind(null, org, space)}
      deleteAsset={deleteAsset.bind(null, org, space)}
    />
  );
}
