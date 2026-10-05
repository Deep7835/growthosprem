// What a post looks like on each platform (CT-03, VW-05): caption truncation, highlighted
// hashtags and mentions, and how media is cropped. Pure, so the content panel, the Previews
// view and the client review page all render the same thing.
import { PLACEMENTS, type PlacementKind, type Platform } from "@/lib/placements";
import { fullCaption } from "@/lib/publishing/rules";

export interface PreviewMedia {
  id: string;
  type: "image" | "video" | "document";
  src: string;
  poster: string | null;
  width: number | null;
  height: number | null;
}

export interface PreviewPost {
  placementId: string;
  kind: PlacementKind;
  account: { handle: string; name: string; color: string };
  caption: string;
  firstComment: string;
  media: PreviewMedia[];
  /** "Sat 31 Oct, 7:00 PM", or null when unscheduled. */
  when: string | null;
  /** Media and caption problems the platform would reject (from the readiness check). */
  issues: string[];
}

/** Where each feed cuts the caption off with "more" (characters and lines shown before it). */
export const TRUNCATION: Record<PlacementKind, { chars: number; lines: number; more: string } | null> = {
  ig_post: { chars: 125, lines: 2, more: "more" },
  ig_carousel: { chars: 125, lines: 2, more: "more" },
  ig_reel: { chars: 55, lines: 1, more: "more" },
  ig_story: null,
  fb_post: { chars: 480, lines: 5, more: "See more" },
  fb_reel: { chars: 80, lines: 2, more: "See more" },
  fb_story: null,
  li_post: { chars: 210, lines: 3, more: "see more" },
};

export function truncate(text: string, rule: { chars: number; lines: number } | null): { shown: string; cut: boolean } {
  if (!rule) return { shown: "", cut: false };
  const lines = text.split("\n");
  let shown = lines.slice(0, rule.lines).join("\n");
  let cut = lines.length > rule.lines;
  if (shown.length > rule.chars) {
    // Cut at a word boundary, like the apps do.
    const slice = shown.slice(0, rule.chars);
    const space = slice.lastIndexOf(" ");
    shown = (space > rule.chars * 0.6 ? slice.slice(0, space) : slice).trimEnd();
    cut = true;
  }
  // The apps put "more" straight after the last visible word.
  return { shown: cut ? shown.replace(/\s+$/, "") : shown, cut };
}

export type Token = { text: string; kind: "text" | "hashtag" | "mention" | "link" };

const PATTERN = /(#[\p{L}\p{M}\p{N}_]+|@[\p{L}\p{N}_.]+[\p{L}\p{N}_]|https?:\/\/[^\s]+)/gu;

/** Splits a caption into plain text, hashtags, mentions and links for highlighting. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), kind: "text" });
    const t = m[0];
    out.push({ text: t, kind: t.startsWith("#") ? "hashtag" : t.startsWith("@") ? "mention" : "link" });
    last = m.index! + t.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: "text" });
  return out;
}

/**
 * The frame ratio (width / height) a feed shows media in. Instagram uses the first item's
 * ratio within 4:5 to 1.91:1 for every slide; Facebook and LinkedIn show a single image as it
 * is within limits; Reels and Stories are 9:16.
 */
export function frameRatio(kind: PlacementKind, media: Pick<PreviewMedia, "width" | "height">[]): number {
  if (kind.endsWith("reel") || kind.endsWith("story")) return 9 / 16;
  const first = media[0];
  const natural = first?.width && first.height ? first.width / first.height : 1;
  if (kind.startsWith("ig_")) return Math.min(1.91, Math.max(0.8, natural));
  return Math.min(1.91, Math.max(0.5, natural));
}

export const platformOf = (kind: PlacementKind): Platform => PLACEMENTS[kind].platform;

export function buildPreviews(input: {
  item: { caption: string; hashtags: string; firstComment: string };
  placements: { id: string; kind: PlacementKind; captionOverride: string | null; account: { handle: string; name: string | null } | null }[];
  media: Omit<PreviewMedia, "src" | "poster">[] & { hasThumb?: boolean }[];
  space: { name: string; color: string };
  when: string | null;
  issues: { placementId?: string; code: string; message: string }[];
  src: (id: string, variant: "original" | "thumb") => string;
}): PreviewPost[] {
  const media = (input.media as (Omit<PreviewMedia, "src" | "poster"> & { hasThumb?: boolean })[]).map((m) => ({
    id: m.id,
    type: m.type,
    width: m.width,
    height: m.height,
    src: input.src(m.id, "original"),
    poster: m.type === "video" && m.hasThumb ? input.src(m.id, "thumb") : null,
  }));
  return input.placements.map((p) => ({
    placementId: p.id,
    kind: p.kind,
    account: {
      handle: p.account?.handle ?? (platformOf(p.kind) === "instagram" ? `@${input.space.name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}` : input.space.name),
      name: p.account?.name ?? input.space.name,
      color: input.space.color,
    },
    caption: fullCaption(p.captionOverride ?? input.item.caption, input.item.hashtags),
    firstComment: input.item.firstComment,
    media,
    when: input.when,
    issues: input.issues
      .filter((i) => (!i.placementId || i.placementId === p.id) && (i.code.startsWith("media.") || i.code.startsWith("caption.")) && i.code !== "media.unreachable")
      .map((i) => i.message),
  }));
}
