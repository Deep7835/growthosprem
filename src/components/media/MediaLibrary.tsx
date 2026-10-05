"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { ACCEPT_ATTRIBUTE, formatBytes } from "@/lib/media-types";
import { uploadFile } from "./upload";

export interface LibraryAssetView {
  id: string;
  type: "image" | "video" | "document";
  source: "upload" | "ai" | "import";
  status: "uploading" | "processing" | "ready" | "failed";
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  tags: string[];
  folderId: string | null;
  createdAt: string;
  hasThumb: boolean;
  error: string | null;
  usedIn: { contentId: string; title: string }[];
}

export interface FolderView {
  id: string;
  name: string;
  isBrandAssets: boolean;
}

interface Upload {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

const TYPE_LABEL = { image: "Image", video: "Video", document: "PDF" } as const;
const SOURCE_LABEL = { upload: "Uploaded", ai: "AI generated", import: "Imported" } as const;

export function assetSrc(base: string, id: string, thumb = true) {
  return `${base}/${id}${thumb ? "?v=thumb" : ""}`;
}

export function AssetThumb({ asset, base, className = "" }: { asset: Pick<LibraryAssetView, "id" | "type" | "status" | "hasThumb" | "filename">; base: string; className?: string }) {
  if (asset.status === "ready" && asset.hasThumb) {
    // Thumbnails come from our own authenticated route, so next/image optimisation doesn't apply.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={assetSrc(base, asset.id)} alt={asset.filename} loading="lazy" className={`size-full object-cover ${className}`} />;
  }
  return (
    <span className={`grid size-full place-items-center bg-ground text-xs font-semibold text-muted ${className}`}>
      {asset.status === "failed" ? "Failed" : asset.status !== "ready" ? "Processing…" : asset.type === "document" ? "PDF" : TYPE_LABEL[asset.type]}
    </span>
  );
}

function details(a: LibraryAssetView) {
  const parts = [TYPE_LABEL[a.type], formatBytes(a.sizeBytes)];
  if (a.width && a.height) parts.push(`${a.width}×${a.height}`);
  if (a.durationSeconds) parts.push(`${Math.round(a.durationSeconds)}s`);
  return parts.join(" · ");
}

export function MediaLibrary({
  org,
  space,
  folders,
  assets,
  usedBytes,
  limitBytes,
  canEdit,
  createFolder,
  updateAsset,
  deleteAsset,
}: {
  org: string;
  space: string;
  folders: FolderView[];
  assets: LibraryAssetView[];
  usedBytes: number;
  limitBytes: number;
  canEdit: boolean;
  createFolder: (name: string) => Promise<void>;
  updateAsset: (id: string, changes: { tags?: string[]; folderId?: string | null }) => Promise<void>;
  deleteAsset: (id: string, confirm: boolean) => Promise<{ inUse?: { id: string; title: string }[] }>;
}) {
  const router = useRouter();
  const base = `/api/o/${org}/s/${space}/media`;
  const [folder, setFolder] = useState<string | "all">("all");
  const [type, setType] = useState<"all" | LibraryAssetView["type"]>("all");
  const [source, setSource] = useState<"all" | LibraryAssetView["source"]>("all");
  const [q, setQ] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const query = q.trim().toLowerCase();
  const visible = assets.filter(
    (a) =>
      (folder === "all" || a.folderId === folder) &&
      (type === "all" || a.type === type) &&
      (source === "all" || a.source === source) &&
      (!query || a.filename.toLowerCase().includes(query) || a.tags.some((t) => t.includes(query))),
  );
  const current = assets.find((a) => a.id === selected) ?? null;
  const pct = Math.min(100, (usedBytes / limitBytes) * 100);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    const queued = list.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, progress: 0 }));
    setUploads((u) => [...queued, ...u]);
    await Promise.all(
      list.map(async (file, i) => {
        const key = queued[i].key;
        try {
          await uploadFile(org, space, file, {
            folderId: folder === "all" ? null : folder,
            onProgress: (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))),
          });
          setUploads((u) => u.filter((x) => x.key !== key));
        } catch (e) {
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e instanceof Error ? e.message : "Upload failed." } : x)));
        }
      }),
    );
    router.refresh();
  }

  return (
    <div
      className="relative mx-auto flex max-w-[1200px] flex-col gap-5 p-6 pb-14"
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-ink bg-surface/90 text-lg font-semibold">
          Drop files to upload{folder !== "all" ? ` to ${folders.find((f) => f.id === folder)?.name}` : ""}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Media</h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className={`block h-full ${pct > 90 ? "bg-danger" : "bg-ink"}`} style={{ width: `${pct}%` }} />
            </span>
            <span>
              {formatBytes(usedBytes)} of {formatBytes(limitBytes)} used
            </span>
          </div>
        </div>
        {canEdit && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              aria-label="Choose files to upload"
              onChange={(e) => {
                if (e.target.files?.length) upload(e.target.files);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={() => input.current?.click()} className={`${buttonClass("primary")} h-11`}>
              Upload
            </button>
          </>
        )}
      </div>

      {uploads.length > 0 && (
        <ul aria-label="Uploads" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
          {uploads.map((u) => (
            <li key={u.key} className="flex flex-col gap-1 text-sm">
              <span className="flex justify-between gap-3">
                <span className="truncate">{u.name}</span>
                {u.error ? (
                  <button type="button" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))} className="text-xs text-muted underline">
                    Dismiss
                  </button>
                ) : (
                  <span className="text-muted">{u.progress < 1 ? `${Math.round(u.progress * 100)}%` : "Processing…"}</span>
                )}
              </span>
              {u.error ? (
                <span role="alert" className="text-xs text-danger">
                  {u.error}
                </span>
              ) : (
                <span className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="block h-full bg-ink transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Folders" className="flex flex-col gap-0.5 text-sm">
          {[{ id: "all", name: "All media", isBrandAssets: false }, ...folders].map((f) => {
            const count = f.id === "all" ? assets.length : assets.filter((a) => a.folderId === f.id).length;
            return (
              <button
                key={f.id}
                type="button"
                aria-current={folder === f.id ? "true" : undefined}
                onClick={() => setFolder(f.id)}
                className={`flex justify-between rounded-lg px-2.5 py-2 text-left ${folder === f.id ? "bg-surface font-semibold shadow-sm" : "text-ink-2 hover:bg-surface"}`}
              >
                <span className="truncate">{f.name}</span>
                <span className="text-muted">{count}</span>
              </button>
            );
          })}
          {canEdit &&
            (newFolder === null ? (
              <button type="button" onClick={() => setNewFolder("")} className="rounded-lg px-2.5 py-2 text-left text-muted hover:bg-surface">
                + New folder
              </button>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newFolder.trim()) return;
                  await createFolder(newFolder);
                  setNewFolder(null);
                }}
                className="flex flex-col gap-1.5 p-1"
              >
                <input
                  autoFocus
                  aria-label="Folder name"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="Folder name"
                  maxLength={60}
                  className="h-9 rounded-lg border border-line px-2"
                />
                <span className="flex gap-1.5">
                  <button type="submit" className={buttonClass("primary", "sm")}>
                    Create
                  </button>
                  <button type="button" onClick={() => setNewFolder(null)} className={buttonClass("ghost", "sm")}>
                    Cancel
                  </button>
                </span>
              </form>
            ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or tag"
              aria-label="Search media"
              className="h-9 min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
            />
            <div role="group" aria-label="Type" className="flex gap-0.5 rounded-lg bg-line-soft p-[3px]">
              {(["all", "image", "video", "document"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className={`h-7 rounded-md px-2.5 text-[13px] font-semibold ${type === t ? "bg-surface shadow-sm" : "text-muted"}`}
                >
                  {t === "all" ? "All" : t === "document" ? "PDFs" : `${TYPE_LABEL[t]}s`}
                </button>
              ))}
            </div>
            <select
              aria-label="Source"
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
            >
              <option value="all">All sources</option>
              {(Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {SOURCE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
              <h2 className="text-lg font-semibold">{assets.length === 0 ? "No media yet" : "Nothing matches these filters"}</h2>
              <p className="max-w-sm text-sm text-muted">
                {assets.length === 0 ? "Upload images, videos and PDFs, or drag them onto this page." : "Try another folder, type or search."}
              </p>
              {canEdit && assets.length === 0 && (
                <button type="button" onClick={() => input.current?.click()} className={buttonClass("primary")}>
                  Upload your first file
                </button>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {visible.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(a.id)}
                    className={`flex w-full flex-col overflow-hidden rounded-xl border bg-surface text-left ${selected === a.id ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink-2"}`}
                  >
                    <span className="relative block aspect-square">
                      <AssetThumb asset={a} base={base} />
                      {a.source === "ai" && <span className="absolute left-2 top-2 rounded bg-ai-bg px-1.5 text-[10px] font-semibold text-ai">AI generated</span>}
                    </span>
                    <span className="flex flex-col gap-0.5 p-2.5">
                      <span className="truncate text-[13px] font-semibold">{a.filename}</span>
                      <span className="text-[11px] text-muted">{details(a)}</span>
                      <span className="text-[11px] text-muted">{a.usedIn.length ? `Used in ${a.usedIn.length} post${a.usedIn.length === 1 ? "" : "s"}` : "Not used yet"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {current && (
        <AssetDetails
          key={current.id}
          asset={current}
          base={base}
          org={org}
          space={space}
          folders={folders}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          updateAsset={updateAsset}
          deleteAsset={deleteAsset}
        />
      )}
    </div>
  );
}

function AssetDetails({
  asset,
  base,
  org,
  space,
  folders,
  canEdit,
  onClose,
  updateAsset,
  deleteAsset,
}: {
  asset: LibraryAssetView;
  base: string;
  org: string;
  space: string;
  folders: FolderView[];
  canEdit: boolean;
  onClose: () => void;
  updateAsset: (id: string, changes: { tags?: string[]; folderId?: string | null }) => Promise<void>;
  deleteAsset: (id: string, confirm: boolean) => Promise<{ inUse?: { id: string; title: string }[] }>;
}) {
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [inUse, setInUse] = useState<{ id: string; title: string }[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  const original = assetSrc(base, asset.id, false);

  return (
    <aside aria-label={asset.filename} className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <h2 className="break-all text-lg font-semibold">{asset.filename}</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className={buttonClass("ghost", "sm")}>
          ✕
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-ground">
        {asset.status !== "ready" ? (
          <p className="p-6 text-sm text-muted">{asset.status === "failed" ? `Upload failed: ${asset.error ?? "unknown error"}` : "Processing…"}</p>
        ) : asset.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={original} alt={asset.filename} className="max-h-[360px] w-full object-contain" />
        ) : asset.type === "video" ? (
          <video src={original} controls preload="metadata" poster={asset.hasThumb ? assetSrc(base, asset.id) : undefined} className="max-h-[360px] w-full" />
        ) : (
          <a href={original} target="_blank" rel="noreferrer" className="block p-6 text-sm font-semibold underline">
            Open PDF
          </a>
        )}
      </div>
      <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
        <dt className="text-muted">Details</dt>
        <dd>{details(asset)}</dd>
        <dt className="text-muted">Source</dt>
        <dd>{SOURCE_LABEL[asset.source]}</dd>
        <dt className="text-muted">Added</dt>
        <dd>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(asset.createdAt))}</dd>
      </dl>

      {canEdit && (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Folder
            <select
              value={asset.folderId ?? ""}
              disabled={pending}
              onChange={(e) => run(() => updateAsset(asset.id, { folderId: e.target.value || null }))}
              className="h-9 rounded-lg border border-line bg-surface px-2 font-normal"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateAsset(asset.id, { tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }));
            }}
            className="flex flex-col gap-1.5 text-sm font-semibold"
          >
            <label htmlFor="asset-tags">Tags</label>
            <span className="flex gap-2">
              <input
                id="asset-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="diwali, sweets, interior"
                className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 font-normal"
              />
              <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
                Save
              </button>
            </span>
          </form>
        </>
      )}

      <section className="flex flex-col gap-1.5 text-sm">
        <h3 className="font-semibold">Used in</h3>
        {asset.usedIn.length === 0 ? (
          <p className="text-muted">Not used in any post yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {asset.usedIn.map((u) => (
              <li key={u.contentId}>
                <Link href={`/o/${org}/s/${space}/board?content=${u.contentId}`} className="underline">
                  {u.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
        {asset.status === "ready" && (
          <a href={`${original}${original.includes("?") ? "&" : "?"}download`} className={buttonClass("secondary")}>
            Download
          </a>
        )}
        {canEdit &&
          (inUse ? (
            <div role="alertdialog" aria-label="Delete media in use" className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger-bg p-3 text-sm text-danger">
              <p>
                This is used in {inUse.length} post{inUse.length === 1 ? "" : "s"}: {inUse.map((u) => u.title).join(", ")}. Deleting removes it from them too,
                and approved posts go back to review.
              </p>
              <span className="flex justify-end gap-2">
                <button type="button" onClick={() => setInUse(null)} className={buttonClass("ghost", "sm")}>
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await deleteAsset(asset.id, true);
                      onClose();
                    })
                  }
                  className="h-8 rounded-lg bg-danger px-3 text-[13px] font-semibold text-white"
                >
                  Delete anyway
                </button>
              </span>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await deleteAsset(asset.id, false);
                  if (result.inUse) setInUse(result.inUse);
                  else onClose();
                })
              }
              className={`${buttonClass("ghost")} text-danger`}
            >
              Delete
            </button>
          ))}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </aside>
  );
}
