// Image processing and file signature checks for uploads. No Next.js imports, so tests can use them.
import sharp from "sharp";

/** Thumbnail and dimensions for an uploaded image. Throws if the bytes are not a real image. */
export async function processImage(original: Buffer) {
  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height) throw new Error("This file isn’t a readable image.");
  const thumb = await sharp(original).rotate().resize(480, 480, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  // EXIF orientation 5–8 means the stored pixels are rotated a quarter turn.
  const rotated = (meta.orientation ?? 1) >= 5;
  return { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height, thumb };
}

/** File signatures, so a renamed file can't pass as a video or PDF. */
export function looksLike(type: "video" | "document", head: Buffer, mime: string): boolean {
  if (type === "document") return head.subarray(0, 4).toString("latin1") === "%PDF";
  if (mime === "video/webm") return head.readUInt32BE(0) === 0x1a45dfa3;
  const box = head.subarray(4, 8).toString("latin1");
  return ["ftyp", "moov", "mdat", "wide", "free"].includes(box);
}
