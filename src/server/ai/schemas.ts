// Inputs of the Copilot's tools. Tool inputs stream eagerly, so the server does not
// validate them: every input is parsed here before it is used (AI-05).
import { z } from "zod";
import { PLACEMENTS, type PlacementKind } from "@/lib/placements";

const placement = z.enum(Object.keys(PLACEMENTS) as [PlacementKind, ...PlacementKind[]]);
const spaceSlug = z.string().min(1).max(80).optional();

export const DraftPost = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  title: z.string().trim().min(1).max(120),
  placements: z.array(placement).min(1).max(4),
  pillar: z.string().trim().max(40).optional(),
  caption: z.string().max(2200).optional(),
});

export const ProposeDraftPosts = z.object({
  space: spaceSlug,
  summary: z.string().max(200).optional(),
  posts: z.array(DraftPost).min(1).max(14),
});

export const CaptionChange = z.object({
  post_id: z.uuid(),
  caption: z.string().max(2200),
  hashtags: z.string().max(500).optional(),
});

export const ProposeCaptions = z.object({
  space: spaceSlug,
  summary: z.string().max(200).optional(),
  changes: z.array(CaptionChange).min(1).max(20),
});

export const ProposedIdea = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).optional(),
  pillar: z.string().trim().max(60).optional(),
  source: z.enum(["ai", "trend", "competitor"]).default("ai"),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export const ProposeIdeas = z.object({
  space: spaceSlug,
  summary: z.string().max(200).optional(),
  ideas: z.array(ProposedIdea).min(1).max(12),
});

export const AnalyticsInput = z.object({ space: spaceSlug, days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) });
export const SpaceInput = z.object({ space: spaceSlug });
export const ListPostsInput = z.object({
  space: spaceSlug,
  status: z.string().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type DraftPostsPayload = z.infer<typeof ProposeDraftPosts>;
export type CaptionsPayload = z.infer<typeof ProposeCaptions>;
export type IdeasPayload = z.infer<typeof ProposeIdeas>;
