// Sample creatives for the demo Cafe space, rendered with sharp, so the board, content panel
// and review page show real images in development. Runs once, when Cafe has no media.
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { assetKey, type Storage } from "@/storage";
import { withOrg, type Db } from "./core";
import { attachMedia, ensureDefaultFolders } from "./media";
import * as s from "./schema";

interface Creative {
  post: string;
  file: string;
  bg: string;
  fg: string;
  kicker: string;
  lines: string[];
  folder?: "project" | "brand";
}

const CREATIVES: Creative[] = [
  { post: "Teaser: Something sweet is coming", file: "teaser.png", bg: "#2B1A3F", fg: "#F2A93B", kicker: "COMING 31 OCT", lines: ["Something", "sweet is", "coming"], folder: "project" },
  { post: "5 Diwali sweets to try this year", file: "sweets-slide-1.png", bg: "#F2A93B", fg: "#17181C", kicker: "SLIDE 1 OF 3", lines: ["5 Diwali", "sweets to try", "this year"], folder: "project" },
  { post: "5 Diwali sweets to try this year", file: "sweets-slide-2.png", bg: "#FCE7B2", fg: "#17181C", kicker: "SLIDE 2 OF 3", lines: ["1. Kaju katli", "2. Coffee barfi", "3. Motichoor"], folder: "project" },
  { post: "5 Diwali sweets to try this year", file: "sweets-slide-3.png", bg: "#17181C", fg: "#F2A93B", kicker: "SLIDE 3 OF 3", lines: ["4. Rasmalai", "5. Gulab jamun", "Save this!"], folder: "project" },
  { post: "Diwali offer: 20% off all sweets", file: "diwali-offer.png", bg: "#7A1F2B", fg: "#FCE7B2", kicker: "1–8 NOV · CAFE", lines: ["20% off", "all sweets"], folder: "project" },
  { post: "Barista day in life", file: "barista.png", bg: "#2E2A25", fg: "#F4F4F0", kicker: "REEL · 0:24", lines: ["6 AM grind", "to the last", "cappuccino"] },
  { post: "5 coffee myths", file: "coffee-myths.png", bg: "#CFE3D8", fg: "#17181C", kicker: "MYTH #1", lines: ["Dark roast has", "more caffeine?"] },
  { post: "Weekend brunch", file: "brunch.png", bg: "#E9E4D8", fg: "#17181C", kicker: "SAT & SUN · 9–1", lines: ["Brunch", "is on"] },
];

function svg(c: Creative) {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const lines = c.lines
    .map((l, i) => `<text x="90" y="${1050 - (c.lines.length - 1 - i) * 120}" font-size="104" font-weight="700">${esc(l)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <rect width="100%" height="100%" fill="${c.bg}"/>
  <g font-family="Helvetica, Arial, sans-serif" fill="${c.fg}">
    <text x="90" y="${1050 - c.lines.length * 120 - 10}" font-size="40" font-weight="700" letter-spacing="6" opacity="0.85">${esc(c.kicker)}</text>
    ${lines}
    <text x="90" y="1250" font-size="36" opacity="0.7">@cafe.delhi</text>
  </g>
</svg>`;
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#F2A93B"/><text x="400" y="470" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="220" font-weight="700" fill="#17181C">Cafe</text></svg>`;

export async function seedDemoMediaIfMissing(db: Db, storage: Storage): Promise<boolean> {
  const [cafe] = await db
    .select({ space: s.spaces })
    .from(s.spaces)
    .innerJoin(s.organizations, eq(s.organizations.id, s.spaces.orgId))
    .where(and(eq(s.organizations.slug, "knockknockclub"), eq(s.spaces.slug, "cafe")));
  if (!cafe) return false;
  const { space } = cafe;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.mediaAssets).where(eq(s.mediaAssets.spaceId, space.id));
  if (count > 0) return false;

  await withOrg(db, space.orgId, async (tx) => {
    await ensureDefaultFolders(tx, space.orgId, space.id);
    const folders = await tx.select().from(s.mediaFolders).where(eq(s.mediaFolders.spaceId, space.id));
    const brand = folders.find((f) => f.isBrandAssets)!;
    const diwali = folders.find((f) => f.name === "Diwali 2026");
    const items = await tx.select().from(s.contentItems).where(eq(s.contentItems.spaceId, space.id));

    const save = async (file: string, png: Buffer, folderId: string | null, tags: string[]) => {
      const [asset] = await tx
        .insert(s.mediaAssets)
        .values({ orgId: space.orgId, spaceId: space.id, folderId, type: "image", status: "ready", filename: file, mimeType: "image/png", storageKey: "pending", tags })
        .returning();
      const storageKey = assetKey(space.orgId, space.id, asset.id, "original");
      const thumbKey = assetKey(space.orgId, space.id, asset.id, "thumb");
      const meta = await sharp(png).metadata();
      await storage.putBuffer(storageKey, png);
      await storage.putBuffer(thumbKey, await sharp(png).resize(480, 480, { fit: "inside" }).webp({ quality: 80 }).toBuffer());
      await tx
        .update(s.mediaAssets)
        .set({ storageKey, thumbKey, sizeBytes: png.length, width: meta.width, height: meta.height })
        .where(eq(s.mediaAssets.id, asset.id));
      return asset.id;
    };

    await save("cafe-logo.png", await sharp(Buffer.from(LOGO)).png().toBuffer(), brand.id, ["logo"]);
    for (const c of CREATIVES) {
      const png = await sharp(Buffer.from(svg(c))).png().toBuffer();
      const folderId = c.folder === "project" ? (diwali?.id ?? null) : null;
      const id = await save(c.file, png, folderId, c.folder === "project" ? ["diwali"] : []);
      const item = items.find((i) => i.title === c.post);
      if (item) await attachMedia(tx, space.orgId, item.id, [id]);
    }
  });
  return true;
}
