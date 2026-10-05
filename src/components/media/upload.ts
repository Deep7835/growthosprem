"use client";

import { ACCEPTED } from "@/lib/media-types";

export interface UploadedAsset {
  id: string;
  status: string;
  type: string;
  filename: string;
}

/** Reads a video's size and length, and grabs a frame at 1 second as its poster. */
function videoDetails(file: File): Promise<{ width: number; height: number; duration: number; poster: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const done = (poster: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration || 0, poster });
    };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      canvas.toBlob((b) => done(b), "image/jpeg", 0.85);
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

function send(url: string, body: Blob, type: string, onProgress?: (fraction: number) => void): Promise<{ status: number; json: { asset?: UploadedAsset; error?: string } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let json = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(body);
  });
}

/** Uploads one file to a space's library (MD-02). Throws with a readable message on failure. */
export async function uploadFile(org: string, space: string, file: File, opts: { folderId?: string | null; onProgress?: (f: number) => void } = {}): Promise<UploadedAsset> {
  const rule = ACCEPTED[file.type];
  if (!rule) throw new Error(`${file.name}: this file type isn’t supported.`);
  if (file.size > rule.maxBytes) throw new Error(`${file.name} is larger than ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`);

  const params = new URLSearchParams({ filename: file.name });
  if (opts.folderId) params.set("folderId", opts.folderId);
  const details = rule.type === "video" ? await videoDetails(file) : null;
  if (details) {
    params.set("width", String(details.width));
    params.set("height", String(details.height));
    params.set("duration", String(details.duration));
  }
  const base = `/api/o/${org}/s/${space}/media`;
  const { status, json } = await send(`${base}?${params}`, file, file.type, opts.onProgress);
  if (status !== 200 || !json.asset) throw new Error(`${file.name}: ${json.error ?? "upload failed."}`);
  if (details?.poster) await send(`${base}/${json.asset.id}/poster`, details.poster, "image/jpeg");
  return json.asset;
}
