import { createHash } from "node:crypto";

export interface VersionedContent {
  title: string;
  caption: string;
  hashtags: string;
  placements: { kind: string; captionOverride: string | null }[];
  /** Attached media ids in order: a new cover or image is a new version. */
  media: string[];
}

/**
 * Fingerprint of what a client approves. An approval stays valid only while the
 * item still hashes to the same value (SH-07).
 */
export function contentVersionHash(c: VersionedContent): string {
  const placements = [...c.placements]
    .map((p) => [p.kind, p.captionOverride ?? ""])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const payload = JSON.stringify([c.title, c.caption, c.hashtags, placements, c.media]);
  return createHash("sha256").update(payload).digest("hex");
}
