import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { contentVersionHash } from "@/lib/content-version";
import { TooLargeError, localStorage, type Storage } from "@/storage";
import { createPgliteDb, withOrg, type Db } from "./core";
import { attachMedia, detachMedia, listLibrary, mediaForContent, moveMedia } from "./media";
import * as s from "./schema";
import { seed } from "./seed";
import { seedDemoMediaIfMissing } from "./seed-media";

let db: Db;
let storage: Storage;
let orgId: string;
let cafeId: string;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  storage = localStorage(await mkdtemp(path.join(tmpdir(), "gos-media-")));
  orgId = (await db.select().from(s.organizations))[0].id;
  cafeId = (await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe")))[0].id;
  await seedDemoMediaIfMissing(db, storage);
}, 60_000);

describe("media library", () => {
  it("creates Brand assets and one folder per project", async () => {
    const lib = await listLibrary(db, orgId, cafeId);
    expect(lib.folders.map((f) => f.name).sort()).toEqual(["Brand assets", "Diwali 2026", "Menu launch"]);
    // Listing again does not duplicate folders.
    expect((await listLibrary(db, orgId, cafeId)).folders).toHaveLength(3);
  });

  it("stores files with thumbnails and reports where each is used and the storage used", async () => {
    const lib = await listLibrary(db, orgId, cafeId);
    expect(lib.assets.length).toBe(9);
    const offer = lib.assets.find((a) => a.filename === "diwali-offer.png")!;
    expect(offer.usedIn.map((u) => u.title)).toEqual(["Diwali offer: 20% off all sweets"]);
    expect(offer.width).toBe(1080);
    expect(await storage.getBuffer(offer.thumbKey!)).not.toBeNull();
    expect(lib.usedBytes).toBe(lib.assets.reduce((a, x) => a + x.sizeBytes, 0));
    expect(lib.assets.find((a) => a.filename === "cafe-logo.png")!.usedIn).toEqual([]);
  });

  it("keeps media in order, with the first as the cover", async () => {
    await withOrg(db, orgId, async (tx) => {
      const [item] = await tx.select().from(s.contentItems).where(eq(s.contentItems.title, "5 Diwali sweets to try this year"));
      const order = async () => (await mediaForContent(tx, [item.id])).map((m) => m.asset.filename);
      expect(await order()).toEqual(["sweets-slide-1.png", "sweets-slide-2.png", "sweets-slide-3.png"]);
      const slide2 = (await mediaForContent(tx, [item.id]))[1].asset.id;
      await moveMedia(tx, item.id, slide2, -1);
      expect(await order()).toEqual(["sweets-slide-2.png", "sweets-slide-1.png", "sweets-slide-3.png"]);
      await detachMedia(tx, item.id, slide2);
      expect((await mediaForContent(tx, [item.id])).map((m) => m.position)).toEqual([0, 1]);
      expect(await attachMedia(tx, orgId, item.id, [slide2, slide2])).toBe(1);
      expect(await order()).toEqual(["sweets-slide-1.png", "sweets-slide-3.png", "sweets-slide-2.png"]);
    });
  });

  it("treats a change of media as a new version for approvals", () => {
    const base = { title: "t", caption: "c", hashtags: "", placements: [] };
    expect(contentVersionHash({ ...base, media: ["a", "b"] })).not.toBe(contentVersionHash({ ...base, media: ["b", "a"] }));
  });
});

describe("storage", () => {
  const stream = (bytes: number) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(bytes));
        c.close();
      },
    });

  it("stops writing past the size limit and leaves nothing behind", async () => {
    await expect(storage.putStream("x/too-big", stream(2048), 1024)).rejects.toBeInstanceOf(TooLargeError);
    expect(await storage.getBuffer("x/too-big")).toBeNull();
    expect(await storage.putStream("x/ok", stream(512), 1024)).toBe(512);
  });

  it("refuses keys that escape the storage folder", async () => {
    await expect(storage.putBuffer("../evil", Buffer.from("x"))).rejects.toThrow(/Invalid storage key/);
    await expect(storage.putBuffer("/etc/passwd", Buffer.from("x"))).rejects.toThrow(/Invalid storage key/);
  });
});

describe("file checks", async () => {
  const { looksLike, processImage } = await import("@/server/media-checks");

  it("reads image size and makes a thumbnail, and rejects non-images", async () => {
    const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#f00" } }).png().toBuffer();
    const result = await processImage(png);
    expect([result.width, result.height]).toEqual([1200, 800]);
    expect((await sharp(result.thumb).metadata()).width).toBe(480);
    await expect(processImage(Buffer.from("not an image"))).rejects.toThrow();
  });

  it("checks video and PDF signatures", () => {
    expect(looksLike("document", Buffer.from("%PDF-1.7"), "application/pdf")).toBe(true);
    expect(looksLike("document", Buffer.from("<html>"), "application/pdf")).toBe(false);
    expect(looksLike("video", Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]), "video/mp4")).toBe(true);
    expect(looksLike("video", Buffer.from("hello world!"), "video/mp4")).toBe(false);
  });
});
