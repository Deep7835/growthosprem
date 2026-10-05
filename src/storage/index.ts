// File storage behind one small interface. Development stores files on disk in
// .data/uploads; production plugs in an S3-compatible bucket (R2 or S3) with the same methods.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export class TooLargeError extends Error {
  constructor(public maxBytes: number) {
    super(`The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
}

export interface Storage {
  /** Writes a stream, failing with TooLargeError past maxBytes. Returns the stored size. */
  putStream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number>;
  putBuffer(key: string, body: Buffer): Promise<void>;
  getBuffer(key: string): Promise<Buffer | null>;
  /** Optionally a byte range (inclusive), for video seeking. */
  getStream(key: string, range?: { start: number; end: number }): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  deletePrefix(prefix: string): Promise<void>;
}

const KEY = /^[a-z0-9][a-z0-9/_.-]*$/i;
function checkKey(key: string) {
  if (!KEY.test(key) || key.includes("..") || key.includes("//")) throw new Error(`Invalid storage key: ${key}`);
}

export function localStorage(root: string): Storage {
  const file = (key: string) => {
    checkKey(key);
    return path.join(root, key);
  };
  return {
    async putStream(key, body, maxBytes) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true });
      const tmp = `${target}.part`;
      let size = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _enc, done) {
          size += chunk.length;
          if (size > maxBytes) done(new TooLargeError(maxBytes));
          else done(null, chunk);
        },
      });
      try {
        await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), limit, createWriteStream(tmp));
        await rename(tmp, target);
        return size;
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
    },
    async putBuffer(key, body) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },
    async getBuffer(key) {
      try {
        return await readFile(file(key));
      } catch {
        return null;
      }
    },
    async getStream(key, range) {
      try {
        const { size } = await stat(file(key));
        return { stream: Readable.toWeb(createReadStream(file(key), range)) as ReadableStream<Uint8Array>, size };
      } catch {
        return null;
      }
    },
    async deletePrefix(prefix) {
      await rm(file(prefix), { recursive: true, force: true });
    },
  };
}

let instance: Storage | null = null;
export function getStorage(): Storage {
  instance ??= localStorage(path.join(process.cwd(), ".data", "uploads"));
  return instance;
}

export const assetKey = (orgId: string, spaceId: string, assetId: string, variant: "original" | "thumb") =>
  `${orgId}/${spaceId}/${assetId}/${variant === "original" ? "original" : "thumb.webp"}`;
export const assetPrefix = (orgId: string, spaceId: string, assetId: string) => `${orgId}/${spaceId}/${assetId}`;
