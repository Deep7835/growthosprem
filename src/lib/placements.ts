export type PlacementKind =
  | "ig_post"
  | "ig_reel"
  | "ig_story"
  | "ig_carousel"
  | "fb_post"
  | "fb_reel"
  | "fb_story"
  | "li_post";

export type Platform = "instagram" | "facebook" | "linkedin";

export const PLACEMENTS: Record<PlacementKind, { platform: Platform; short: string; label: string }> = {
  ig_post: { platform: "instagram", short: "IG Post", label: "Instagram Post" },
  ig_reel: { platform: "instagram", short: "IG Reel", label: "Instagram Reel" },
  ig_story: { platform: "instagram", short: "IG Story", label: "Instagram Story" },
  ig_carousel: { platform: "instagram", short: "IG Carousel", label: "Instagram Carousel" },
  fb_post: { platform: "facebook", short: "FB Post", label: "Facebook Post" },
  fb_reel: { platform: "facebook", short: "FB Reel", label: "Facebook Reel" },
  fb_story: { platform: "facebook", short: "FB Story", label: "Facebook Story" },
  li_post: { platform: "linkedin", short: "LI Post", label: "LinkedIn Post" },
};

/** Caption limits per platform, used for the counters in the content panel (CT-06). */
export const CAPTION_LIMITS: Record<Platform, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
};

export const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};
