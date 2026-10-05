// Accepted uploads (MD-02). SVG is not accepted: it can carry scripts.

export type MediaType = "image" | "video" | "document";

export const ACCEPTED: Record<string, { type: MediaType; maxBytes: number }> = {
  "image/jpeg": { type: "image", maxBytes: 25 * 1024 * 1024 },
  "image/png": { type: "image", maxBytes: 25 * 1024 * 1024 },
  "image/webp": { type: "image", maxBytes: 25 * 1024 * 1024 },
  "image/gif": { type: "image", maxBytes: 25 * 1024 * 1024 },
  "video/mp4": { type: "video", maxBytes: 500 * 1024 * 1024 },
  "video/quicktime": { type: "video", maxBytes: 500 * 1024 * 1024 },
  "video/webm": { type: "video", maxBytes: 500 * 1024 * 1024 },
  "application/pdf": { type: "document", maxBytes: 50 * 1024 * 1024 },
};

export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED).join(",");


export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
