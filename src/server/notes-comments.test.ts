import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { addNoteComment, createNote, duplicateNote, listNoteComments } from "./notes";
import { addPlacement } from "./publishing";
import { checkFiles } from "./support";
import type { SpaceContext } from "./tenancy";

let db: Db;
let ctx: SpaceContext;
let rahul: typeof s.users.$inferSelect;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [org] = await db.select().from(s.organizations);
  const [space] = await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe"));
  const [user] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
  [rahul] = await db.select().from(s.users).where(eq(s.users.email, "rahul@example.com"));
  ctx = { org, space, user, role: "owner", project: null, requestTime: Date.now(), can: () => true } as unknown as SpaceContext;
}, 60_000);

describe("notes", () => {
  it("keeps team comments in order and notifies people @mentioned", async () => {
    const id = await createNote(ctx, null, "brief");
    await addNoteComment(ctx, id, "First thought", "/n");
    await addNoteComment(ctx, id, "@Rahul can you add the reel dates?", "/n");
    expect((await listNoteComments(ctx, id)).map((c) => c.body)).toEqual(["First thought", "@Rahul can you add the reel dates?"]);
    const sent = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, rahul.id), eq(s.notifications.kind, "mention")));
    expect(sent.some((n) => n.title.includes("mentioned you on"))).toBe(true);
  });

  it("duplicates a note with its text", async () => {
    const id = await createNote(ctx, null, "meeting");
    const copy = await duplicateNote(ctx, id);
    const [a] = await db.select().from(s.notes).where(eq(s.notes.id, id));
    const [b] = await db.select().from(s.notes).where(eq(s.notes.id, copy));
    expect(b.title).toBe(`${a.title} (copy)`);
    expect(b.text).toBe(a.text);
  });
});

describe("post defaults and support files", () => {
  it("starts new Reels with the space's share-to-feed default", async () => {
    const [status] = await db.select().from(s.statuses).where(and(eq(s.statuses.spaceId, ctx.space.id), eq(s.statuses.appliesTo, "content")));
    const [item] = await db.insert(s.contentItems).values({ orgId: ctx.org.id, spaceId: ctx.space.id, title: "Reel", statusId: status.id }).returning();
    const off = { ...ctx, space: { ...ctx.space, postDefaults: { shareReelsToFeed: false } } } as SpaceContext;
    await addPlacement(off, item.id, "ig_reel");
    const [p] = await db.select().from(s.placements).where(eq(s.placements.contentItemId, item.id));
    expect(p.options).toEqual({ shareToFeed: false });
  });

  it("accepts images, videos and PDFs up to 10 MB, three at most", () => {
    const f = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
    expect(checkFiles([f("a.png", "image/png"), f("b.mp4", "video/mp4"), f("c.pdf", "application/pdf")])).toBeNull();
    expect(checkFiles([f("a.png", "image/png"), f("b.png", "image/png"), f("c.png", "image/png"), f("d.png", "image/png")])).toMatch(/up to 3/);
    expect(checkFiles([f("x.txt", "text/plain")])).toMatch(/isn’t an image/);
    expect(checkFiles([f("big.mp4", "video/mp4", 10 * 1024 * 1024 + 1)])).toMatch(/over 10 MB/);
  });
});
