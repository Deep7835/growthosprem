// AI tag vocabulary (PRD 9, "AI tagging"), shared by the tagger and the screens.
export const HOOK_TYPES = ["Question", "Bold claim", "Number or list", "How-to", "Story", "Behind the scenes", "Offer", "Trend", "Testimonial", "Announcement", "None"] as const;
export type HookType = (typeof HOOK_TYPES)[number];
