// Readiness check (PB-06): runs when someone schedules or posts, and again just before
// publishing. Pure, so the panel, the scheduler and the worker all give the same answer.
import { CAPTION_LIMITS, PLACEMENTS, PLATFORM_NAMES, type PlacementKind } from "@/lib/placements";

export type FixKind = "accounts" | "media" | "caption" | "placements" | "status" | "approval" | "time" | "settings";

export interface Issue {
  code: string;
  message: string;
  /** Set when the issue belongs to one placement; otherwise it blocks every placement. */
  placementId?: string;
  fix: { kind: FixKind; label: string };
}

export interface ReadinessMedia {
  id: string;
  type: "image" | "video" | "document";
  status: string;
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface ReadinessPlacement {
  id: string;
  kind: PlacementKind;
  state: string;
  captionOverride: string | null;
  /** The account it will post to, if any. */
  account: { handle: string; status: string; canPublish: boolean } | null;
}

export interface ReadinessInput {
  /** "now" and autopost schedules publish through the API; manual schedules only remind. */
  mode: "now" | "autopost" | "manual";
  when: Date | null;
  now: Date;
  item: { caption: string; hashtags: string; firstComment: string };
  status: { name: string; autopostEligible: boolean };
  requireApproval: boolean;
  approved: boolean;
  placements: ReadinessPlacement[];
  media: ReadinessMedia[];
  /** False when Meta can't fetch our media (live mode on localhost). */
  mediaReachable: boolean;
}

const MB = 1024 * 1024;
const LIMITS = {
  igImageRatio: [0.8, 1.91],
  igReelSeconds: [3, 15 * 60],
  igReelBytes: 300 * MB,
  igStoryVideoSeconds: [3, 60],
  igStoryBytes: 100 * MB,
  igCarouselItems: [2, 10],
  igCarouselVideoSeconds: [3, 60],
  fbReelSeconds: [3, 90],
  fbImages: 10,
  fbVideoBytes: 1024 * MB,
  igHashtags: 30,
} as const;

export function fullCaption(caption: string, hashtags: string) {
  return [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
}

const label = (kind: PlacementKind) => PLACEMENTS[kind].label;
const fixMedia: Issue["fix"] = { kind: "media", label: "Fix media" };

function ratio(m: ReadinessMedia) {
  return m.width && m.height ? m.width / m.height : null;
}

function between(n: number | null, [lo, hi]: readonly [number, number]) {
  return n === null || (n >= lo && n <= hi);
}

/** What a placement needs from the attached media (type, count, ratio, duration, size). */
export function mediaIssues(placementId: string, kind: PlacementKind, media: ReadinessMedia[]): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, message: string, fix = fixMedia) => out.push({ code, message, placementId, fix });
  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");
  const name = label(kind);

  if (media.some((m) => m.type === "document")) add("media.document", `${name} can’t include PDFs or documents. Remove them from this post.`);
  for (const m of media) {
    if (m.status !== "ready") add("media.not_ready", `${m.filename} is still ${m.status === "failed" ? "broken" : "processing"}. Wait for it or replace it.`);
  }

  switch (kind) {
    case "ig_post":
      if (media.length === 0) add("media.missing", `${name} needs one image.`, { kind: "media", label: "Upload media" });
      else if (videos.length) add("media.ig_video", "Instagram posts videos as Reels. Switch this placement to Instagram Reel.", { kind: "placements", label: "Change placement" });
      else if (images.length > 1) add("media.ig_many", "More than one image needs Instagram Carousel. Switch the placement or keep one image.", { kind: "placements", label: "Change placement" });
      else if (!between(ratio(images[0]), LIMITS.igImageRatio))
        add("media.ratio", `${images[0].filename} is too tall or too wide for an Instagram post. Use a ratio between 4:5 and 1.91:1.`);
      break;
    case "ig_carousel":
      if (media.length < LIMITS.igCarouselItems[0] || media.length > LIMITS.igCarouselItems[1])
        add("media.carousel_count", `${name} needs 2 to 10 images or videos (now ${media.length}).`, { kind: "media", label: "Upload media" });
      for (const m of images) if (!between(ratio(m), LIMITS.igImageRatio)) add("media.ratio", `${m.filename} is outside Instagram’s 4:5 to 1.91:1 range.`);
      for (const m of videos)
        if (!between(m.durationSeconds, LIMITS.igCarouselVideoSeconds)) add("media.duration", `${m.filename} must be 3 to 60 seconds long in a carousel.`);
      break;
    case "ig_reel":
      if (videos.length !== 1 || images.length) add("media.reel", `${name} needs exactly one video.`, { kind: "media", label: "Upload video" });
      else {
        if (!between(videos[0].durationSeconds, LIMITS.igReelSeconds)) add("media.duration", "Instagram Reels must be 3 seconds to 15 minutes long.");
        if (videos[0].sizeBytes > LIMITS.igReelBytes) add("media.size", "Instagram Reels can be up to 300 MB. Export a smaller file.");
      }
      break;
    case "ig_story":
    case "fb_story":
      if (media.length !== 1) add("media.story", `${name} needs exactly one image or video.`, { kind: "media", label: "Upload media" });
      else if (videos[0]) {
        if (!between(videos[0].durationSeconds, LIMITS.igStoryVideoSeconds)) add("media.duration", "Story videos must be 3 to 60 seconds long.");
        if (videos[0].sizeBytes > LIMITS.igStoryBytes) add("media.size", "Story videos can be up to 100 MB.");
      }
      break;
    case "fb_reel":
      if (videos.length !== 1 || images.length) add("media.reel", `${name} needs exactly one video.`, { kind: "media", label: "Upload video" });
      else if (!between(videos[0].durationSeconds, LIMITS.fbReelSeconds)) add("media.duration", "Facebook Reels must be 3 to 90 seconds long.");
      else if (ratio(videos[0]) !== null && ratio(videos[0])! > 0.6) add("media.ratio", "Facebook Reels must be vertical (9:16).");
      break;
    case "fb_post":
      if (videos.length && images.length) add("media.mixed", "A Facebook post can have images or one video, not both.");
      else if (videos.length > 1) add("media.fb_videos", "A Facebook post can have one video.");
      else if (images.length > LIMITS.fbImages) add("media.fb_images", "A Facebook post can have up to 10 images.");
      else if (videos[0] && videos[0].sizeBytes > LIMITS.fbVideoBytes) add("media.size", "Facebook videos can be up to 1 GB here.");
      break;
    case "li_post":
      add("platform.linkedin", "LinkedIn publishing arrives in a later milestone. Post it yourself and mark it as posted.", { kind: "placements", label: "Remove LinkedIn" });
      break;
  }
  return out;
}

export function checkReadiness(input: ReadinessInput): Issue[] {
  const issues: Issue[] = [];
  const pending = input.placements.filter((p) => p.state !== "published");
  const viaApi = input.mode !== "manual";

  if (pending.length === 0) {
    issues.push({ code: "placements.none", message: "Add at least one platform to post to.", fix: { kind: "placements", label: "Add a platform" } });
  }
  if (input.mode !== "now") {
    if (!input.when) issues.push({ code: "time.missing", message: "Pick a date and time.", fix: { kind: "time", label: "Pick a time" } });
    else if (input.when.getTime() < input.now.getTime() + 60_000)
      issues.push({ code: "time.past", message: "The time is in the past. Pick a time at least a minute from now.", fix: { kind: "time", label: "Pick a later time" } });
  }
  if (input.requireApproval && !input.approved) {
    issues.push({
      code: "approval.missing",
      message: "This space needs client approval before publishing, and this version isn’t approved yet.",
      fix: { kind: "approval", label: "Share for client review" },
    });
  }
  if (viaApi && !input.status.autopostEligible) {
    issues.push({
      code: "status.ineligible",
      message: `Posts in “${input.status.name}” can’t publish automatically. Move it to a status that can, or change that in Autopost settings.`,
      fix: { kind: "status", label: "Change status" },
    });
  }

  for (const p of pending) {
    const platform = PLACEMENTS[p.kind].platform;
    const caption = fullCaption(p.captionOverride ?? input.item.caption, input.item.hashtags);
    if (caption.length > CAPTION_LIMITS[platform]) {
      issues.push({
        code: "caption.length",
        placementId: p.id,
        message: `The caption is ${caption.length.toLocaleString("en-IN")} characters; ${PLATFORM_NAMES[platform]} allows ${CAPTION_LIMITS[platform].toLocaleString("en-IN")}.`,
        fix: { kind: "caption", label: "Edit caption" },
      });
    }
    if (platform === "instagram" && (caption.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? []).length > LIMITS.igHashtags) {
      issues.push({ code: "caption.hashtags", placementId: p.id, message: "Instagram allows up to 30 hashtags.", fix: { kind: "caption", label: "Edit hashtags" } });
    }
    if (p.kind === "fb_post" && !caption && input.media.length === 0) {
      issues.push({ code: "caption.empty", placementId: p.id, message: "A Facebook post needs a caption or media.", fix: { kind: "caption", label: "Write a caption" } });
    }
    if (!viaApi) continue;

    if (!p.account || !p.account.canPublish) {
      const name = PLATFORM_NAMES[platform];
      issues.push({
        code: "account.missing",
        placementId: p.id,
        message: !p.account
          ? `No ${name} account is connected to this space.`
          : p.account.status === "reconnect_needed" || p.account.status === "disconnected"
            ? `${p.account.handle} needs reconnecting before it can publish.`
            : `${p.account.handle} is sample data and can’t publish. Connect the real account.`,
        fix: { kind: "accounts", label: `Connect ${name}` },
      });
    }
    issues.push(...mediaIssues(p.id, p.kind, input.media));
  }

  if (viaApi && input.media.length > 0 && !input.mediaReachable) {
    issues.push({
      code: "media.unreachable",
      message: "Meta fetches media from this app, and it can’t reach localhost. Set APP_URL to a public address (a tunnel works for testing).",
      fix: { kind: "settings", label: "How to set APP_URL" },
    });
  }

  // One message per problem: identical placement-level issues are listed once.
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.code}|${i.placementId ?? ""}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Issues that stop this one placement (its own plus the ones for the whole post). */
export function issuesFor(placementId: string, issues: Issue[]) {
  return issues.filter((i) => !i.placementId || i.placementId === placementId);
}

/** The item's publish state from its placements (PB-09). */
export function itemPublishState(states: string[]): "not_scheduled" | "scheduled" | "publishing" | "published" | "partially_published" | "failed" {
  const live = states.filter((s) => s !== "draft");
  if (live.length === 0) return "not_scheduled";
  if (live.every((s) => s === "published")) return "published";
  if (live.some((s) => s === "publishing")) return "publishing";
  if (live.some((s) => s === "scheduled")) return live.some((s) => s === "published" || s === "failed") ? "publishing" : "scheduled";
  if (live.some((s) => s === "published")) return "partially_published";
  return "failed";
}
