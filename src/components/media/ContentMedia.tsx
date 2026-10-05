"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { ACCEPT_ATTRIBUTE } from "@/lib/media-types";
import { AssetThumb } from "./MediaLibrary";
import { uploadFile } from "./upload";

export interface MediaView {
  id: string;
  type: "image" | "video" | "document";
  status: "uploading" | "processing" | "ready" | "failed";
  filename: string;
  hasThumb: boolean;
}

/** The content panel's media tab (CT-02): ordered media, first is the cover. */
export function ContentMedia({
  org,
  space,
  attached,
  library,
  canEdit,
  attach,
  detach,
  move,
}: {
  org: string;
  space: string;
  attached: MediaView[];
  library: MediaView[];
  canEdit: boolean;
  attach: (ids: string[]) => Promise<void>;
  detach: (id: string) => Promise<void>;
  move: (id: string, direction: -1 | 1) => Promise<void>;
}) {
  const router = useRouter();
  const base = `/api/o/${org}/s/${space}/media`;
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });

  async function uploadAndAttach(files: FileList) {
    setError(null);
    const ids: string[] = [];
    for (const [i, file] of [...files].entries()) {
      try {
        const asset = await uploadFile(org, space, file, { onProgress: (p) => setProgress((i + p) / files.length) });
        ids.push(asset.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    }
    setProgress(null);
    if (ids.length) run(() => attach(ids));
    router.refresh();
  }

  const available = library.filter((a) => !attached.some((x) => x.id === a.id));

  return (
    <div className="flex flex-col gap-3">
      {attached.length === 0 ? (
        <div
          className="grid aspect-[4/5] place-items-center rounded-xl border-2 border-dashed border-line bg-subtle p-6 text-center text-sm text-muted"
          onDragOver={(e) => canEdit && e.preventDefault()}
          onDrop={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            if (e.dataTransfer.files.length) uploadAndAttach(e.dataTransfer.files);
          }}
        >
          <span>
            {canEdit ? "Drop media here or pick from the library." : "No media yet."}
            <br />
            The first image is the cover where platforms allow.
          </span>
        </div>
      ) : (
        <ol className="grid grid-cols-2 gap-2">
          {attached.map((m, i) => (
            <li key={m.id} className="group relative overflow-hidden rounded-lg border border-line">
              <span className="block aspect-[4/5]">
                <AssetThumb asset={m} base={base} />
              </span>
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
              {canEdit && (
                <span className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
                  <span className="flex gap-1">
                    <button type="button" disabled={i === 0 || pending} onClick={() => run(() => move(m.id, -1))} aria-label={`Move ${m.filename} earlier`} className="grid size-7 place-items-center rounded-md bg-surface/95 text-xs shadow disabled:opacity-40">
                      ←
                    </button>
                    <button type="button" disabled={i === attached.length - 1 || pending} onClick={() => run(() => move(m.id, 1))} aria-label={`Move ${m.filename} later`} className="grid size-7 place-items-center rounded-md bg-surface/95 text-xs shadow disabled:opacity-40">
                      →
                    </button>
                  </span>
                  <button type="button" disabled={pending} onClick={() => run(() => detach(m.id))} aria-label={`Remove ${m.filename} from this post`} className="grid size-7 place-items-center rounded-md bg-surface/95 text-xs shadow">
                    ✕
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPicking(true)} className={buttonClass("secondary", "sm")}>
            Add from library
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            aria-label="Upload media to this post"
            onChange={(e) => {
              if (e.target.files?.length) uploadAndAttach(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => input.current?.click()} disabled={progress !== null} className={buttonClass("secondary", "sm")}>
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Upload"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {picking && (
        <div role="dialog" aria-modal="true" aria-label="Add from library" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-4 rounded-2xl bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add from library</h2>
              <button type="button" onClick={() => setPicking(false)} aria-label="Close" className={buttonClass("ghost", "sm")}>
                ✕
              </button>
            </div>
            {available.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">Everything in the library is already on this post, or the library is empty.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-y-auto">
                {available.map((a) => {
                  const on = chosen.includes(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setChosen(on ? chosen.filter((x) => x !== a.id) : [...chosen, a.id])}
                        className={`relative block w-full overflow-hidden rounded-lg border ${on ? "border-ink ring-2 ring-ink" : "border-line"}`}
                      >
                        <span className="block aspect-square">
                          <AssetThumb asset={a} base={base} />
                        </span>
                        {on && <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-white">{chosen.indexOf(a.id) + 1}</span>}
                        <span className="block truncate px-2 py-1.5 text-left text-[11px]">{a.filename}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPicking(false)} className={buttonClass("ghost")}>
                Cancel
              </button>
              <button
                type="button"
                disabled={chosen.length === 0 || pending}
                onClick={() =>
                  run(async () => {
                    await attach(chosen);
                    setChosen([]);
                    setPicking(false);
                  })
                }
                className={buttonClass("primary")}
              >
                {chosen.length ? `Add ${chosen.length}` : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
