import "server-only";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/db";
import { aiActions, aiMessages, brandBrains, contentItems, usageEvents } from "@/db/schema";
import { COPILOT_MODEL, WRITING_MODEL, creditsFor, type TokenUsage } from "@/lib/ai/config";

let client: Anthropic | null | undefined;

/**
 * Whether credentials are configured: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
 * `ant auth login` profile. The SDK resolves them lazily, so this is checked up front.
 */
function credentialsConfigured() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) return true;
  return existsSync(path.join(os.homedir(), ".config", "anthropic"));
}

/** The API client, or null when AI isn't set up. */
export function anthropic(): Anthropic | null {
  if (client === undefined) client = credentialsConfigured() ? new Anthropic() : null;
  return client;
}

export const AI_SETUP_MESSAGE = "AI isn’t set up yet. Add ANTHROPIC_API_KEY to .env.local and restart the app.";

/** Plain-language message for an API failure; never leaks internals to the page. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message === AI_SETUP_MESSAGE) return AI_SETUP_MESSAGE;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return AI_SETUP_MESSAGE;
  if (e instanceof Anthropic.RateLimitError) return "AI is busy right now. Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn’t reach the AI service. Check your connection and try again.";
  if (e instanceof Anthropic.APIError) return `The AI service returned an error (${e.status ?? "unknown"}). Try again.`;
  if (e instanceof Error && /api key|apiKey|authentication/i.test(e.message)) return AI_SETUP_MESSAGE;
  return "Something went wrong with AI. Try again.";
}

/* ---------- Budget (AI-13) ---------- */

const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

export async function creditsUsedThisMonth(orgId: string): Promise<number> {
  const [{ used }] = await withOrg(orgId, (tx) =>
    tx.select({ used: sql<number>`coalesce(sum(${usageEvents.credits}), 0)::int` }).from(usageEvents).where(gte(usageEvents.createdAt, monthStart())),
  );
  return used;
}

export async function usageThisMonth(orgId: string) {
  return withOrg(orgId, (tx) =>
    tx
      .select({ userId: usageEvents.userId, spaceId: usageEvents.spaceId, kind: usageEvents.kind, credits: sql<number>`sum(${usageEvents.credits})::int` })
      .from(usageEvents)
      .where(gte(usageEvents.createdAt, monthStart()))
      .groupBy(usageEvents.userId, usageEvents.spaceId, usageEvents.kind),
  );
}

export async function recordUsage(entry: { orgId: string; userId: string; spaceId: string | null; kind: string; model: string; usage: TokenUsage }) {
  const credits = creditsFor(entry.model, entry.usage);
  await withOrg(entry.orgId, (tx) =>
    tx.insert(usageEvents).values({
      orgId: entry.orgId,
      userId: entry.userId,
      spaceId: entry.spaceId,
      kind: entry.kind,
      model: entry.model,
      inputTokens: entry.usage.input_tokens,
      outputTokens: entry.usage.output_tokens,
      cacheReadTokens: entry.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: entry.usage.cache_creation_input_tokens ?? 0,
      credits,
    }),
  );
  return credits;
}

/* ---------- The Copilot's instructions ---------- */

// Kept byte-for-byte stable so it stays in the prompt cache.
const STABLE_SYSTEM = `You are AI Copilot inside Growth OS, a social media workspace for agencies and brands, most of them in India. Each organisation has spaces, one per client or brand. You help people plan, write and understand their social media.

How you work:
- Read real data with the tools before answering anything about performance, plans or posts.
- Only state numbers that appear in tool results, copied exactly or rounded. Never estimate, add up or calculate numbers yourself; if a number isn't available, say so.
- End each sentence that states a fact from the data with the tag [Your data]. End each recommendation or idea of yours with the tag [AI suggestion]. Use the tags nowhere else.
- If a tool result says sampleData is true, mention once that the numbers are sample data.
- When the person wants posts planned, written or rewritten, use propose_draft_posts or propose_captions. These show an action card that the person edits and approves. Never say something was created or changed before they approve it.
- Write captions in the brand's voice and caption language from get_brand_brain: English, Hindi in Devanagari script, or Hinglish in Latin script. Follow the brand's dos and don'ts.
- Dates and times are in the space's timezone. For Indian organisations use Indian number grouping, for example 1,92,400.
- Be brief and plain: short paragraphs or short lists, no headings unless asked. If a request is ambiguous, ask one short question instead of guessing.
- You see only what this person can see. You never publish, delete or message clients.`;

export function copilotSystem(context: { orgName: string; userName: string; role: string; space: { name: string; slug: string } | null; today: string }) {
  const scope = context.space
    ? `This conversation is about the ${context.space.name} space (slug: ${context.space.slug}); leave the space parameter out of tool calls.`
    : "This conversation covers the whole organisation; call list_spaces to see the spaces and pass the space slug to other tools.";
  return [
    { type: "text" as const, text: STABLE_SYSTEM, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: `Organisation: ${context.orgName}. You're working with ${context.userName} (${context.role}). ${scope} Today is ${context.today}.` },
  ];
}

/* ---------- Conversation history ---------- */

export async function loadHistory(orgId: string, conversationId: string): Promise<Anthropic.Beta.Messages.BetaMessageParam[]> {
  const rows = await withOrg(orgId, (tx) => tx.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.createdAt)));
  return rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content as Anthropic.Beta.Messages.BetaMessageParam["content"] }));
}

/** What happened to cards since the last message, so the model knows (an app note in the next user turn). */
export async function cardNotes(orgId: string, conversationId: string, since: Date | null): Promise<string | null> {
  const resolved = await withOrg(orgId, (tx) =>
    tx
      .select()
      .from(aiActions)
      .where(and(eq(aiActions.conversationId, conversationId), since ? gte(aiActions.resolvedAt, since) : sql`${aiActions.resolvedAt} is not null`)),
  );
  if (!resolved.length) return null;
  const lines = resolved.map((a) => {
    const what = a.tool === "propose_draft_posts" ? "draft posts" : "captions";
    const state = { executed: "approved and applied", dismissed: "dismissed", undone: "approved, then undone", failed: "failed", proposed: "still waiting" }[a.state];
    return `- The ${what} card was ${state}.`;
  });
  return `[App note about earlier cards]\n${lines.join("\n")}`;
}

/* ---------- Brand Brain drafting (AI-10, OB-06) ---------- */

export const BrandBrainDraft = z.object({
  description: z.string(),
  audience: z.string(),
  voice: z.string(),
  dos: z.string(),
  donts: z.string(),
  offers: z.string(),
  usps: z.string(),
  faqs: z.string(),
  competitors: z.string(),
  captionLanguage: z.enum(["en", "hi", "hinglish"]),
});
export type BrandBrainDraft = z.infer<typeof BrandBrainDraft>;

const BRAND_INSTRUCTIONS = `Draft a Brand Brain for a social media team from the material provided. Each field is plain text: a few short sentences or a short list with one item per line. Leave a field empty when the material doesn't support it; don't invent offers, prices or facts. captionLanguage is "hinglish" only if the brand clearly writes in Hinglish, "hi" if in Hindi, otherwise "en".`;

export async function draftBrandBrain(source: { website: string } | { text: string }): Promise<{ draft: BrandBrainDraft; usage: TokenUsage; model: string }> {
  const api = anthropic();
  if (!api) throw new Error(AI_SETUP_MESSAGE);
  const content =
    "website" in source
      ? `${BRAND_INSTRUCTIONS}\n\nRead the brand's website at ${source.website} (the home page and, if useful, one or two linked pages such as About or Menu), then draft the fields.`
      : `${BRAND_INSTRUCTIONS}\n\nHere is what the brand wrote about itself:\n\n<material>\n${source.text}\n</material>`;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content }];
  const total: TokenUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  // The page is fetched on Anthropic's side, never by our server.
  for (let i = 0; i < 4; i++) {
    const response = await api.beta.messages.parse({
      model: COPILOT_MODEL,
      max_tokens: 8000,
      messages,
      tools: "website" in source ? [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 }] : undefined,
      output_config: { effort: "low", format: betaZodOutputFormat(BrandBrainDraft) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    total.input_tokens += response.usage.input_tokens;
    total.output_tokens += response.usage.output_tokens;
    total.cache_read_input_tokens! += response.usage.cache_read_input_tokens ?? 0;
    total.cache_creation_input_tokens! += response.usage.cache_creation_input_tokens ?? 0;
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content as Anthropic.Beta.Messages.BetaMessageParam["content"] });
      continue;
    }
    if (response.stop_reason === "refusal") throw new Error("AI couldn’t draft from that material. Try pasting a description instead.");
    if (!response.parsed_output) throw new Error("AI couldn’t read that website. Try pasting a description instead.");
    return { draft: response.parsed_output, usage: total, model: response.model };
  }
  throw new Error("The website took too long to read. Try pasting a description instead.");
}

/* ---------- Inline caption help (CT-08) ---------- */

export const CAPTION_MODES = {
  write: "Write a caption for this post.",
  improve: "Improve this caption: clearer, more engaging, same meaning and length.",
  shorten: "Shorten this caption to about half, keeping the key message and call to action.",
  hinglish: "Rewrite this caption in Hinglish (Hindi words in Latin script, mixed naturally with English).",
  hindi: "Rewrite this caption in Hindi, in Devanagari script.",
  hooks: "Suggest 5 different opening hooks for this post, one per line, numbered.",
  hashtags: "Suggest 8 to 12 relevant hashtags for this post, space-separated, mixing broad and local ones.",
} as const;
export type CaptionMode = keyof typeof CAPTION_MODES;

export async function captionHelp(input: {
  mode: CaptionMode;
  post: { title: string; caption: string; pillar: string | null; placements: string[] };
  brand: Partial<BrandBrainDraft> | null;
}): Promise<{ text: string; usage: TokenUsage; model: string }> {
  const api = anthropic();
  if (!api) throw new Error(AI_SETUP_MESSAGE);
  const brand = input.brand
    ? `Brand voice: ${input.brand.voice || "friendly and clear"}\nAudience: ${input.brand.audience || "not specified"}\nDo: ${input.brand.dos || "-"}\nDon't: ${input.brand.donts || "-"}\nCaption language: ${input.brand.captionLanguage ?? "en"}`
    : "No Brand Brain yet: write in a friendly, clear voice in English.";
  const response = await api.beta.messages.create({
    model: WRITING_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: "You write social media copy for a brand. Reply with only the requested text: no preamble, no quotes, no explanation.",
    messages: [
      {
        role: "user",
        content: `${brand}\n\nPost: ${input.post.title}\nPlatforms: ${input.post.placements.join(", ") || "Instagram"}\nPillar: ${input.post.pillar ?? "-"}\nCurrent caption:\n${input.post.caption || "(empty)"}\n\n${CAPTION_MODES[input.mode]}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("AI couldn’t help with this caption.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text, usage: response.usage, model: response.model };
}

/** Post titles and captions for caption cards, shown next to the proposed text. */
export async function postsById(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  return withOrg(orgId, (tx) => tx.select({ id: contentItems.id, title: contentItems.title, caption: contentItems.caption }).from(contentItems).where(inArray(contentItems.id, ids)));
}

export async function getBrandBrain(orgId: string, spaceId: string) {
  const [brain] = await withOrg(orgId, (tx) => tx.select().from(brandBrains).where(eq(brandBrains.spaceId, spaceId)));
  return brain ?? null;
}

/* ---------- Idea Bank: group ideas by pillar (VW-07) ---------- */

const PillarAssignments = z.object({
  assignments: z.array(z.object({ id: z.string(), pillar: z.string() })),
});

/**
 * Suggests a content pillar for each idea, reusing the space's existing pillars where they fit
 * and keeping the set small. Suggestions only: nothing changes until the person approves.
 */
export async function suggestIdeaPillars(input: {
  ideas: { id: string; title: string; notes: string }[];
  pillars: string[];
  brand: Partial<BrandBrainDraft> | null;
}): Promise<{ assignments: { id: string; pillar: string }[]; usage: TokenUsage; model: string }> {
  const api = anthropic();
  if (!api) throw new Error(AI_SETUP_MESSAGE);
  const list = input.ideas.map((i) => `- id ${i.id}: ${i.title}${i.notes ? ` (${i.notes.slice(0, 200).replace(/\n/g, " ")})` : ""}`).join("\n");
  const response = await api.beta.messages.parse({
    model: WRITING_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(PillarAssignments) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You organise a social media team's post ideas into content pillars: the 3 to 6 recurring themes a brand posts about (for example Education, Behind the scenes, Offers, Community). Reuse the brand's existing pillars whenever an idea fits one, spelled exactly as given. Only add a new pillar when an idea clearly fits none. Pillar names are short (1 to 3 words), in Title Case.",
    messages: [
      {
        role: "user",
        content: `Brand: ${input.brand?.description || "not described yet"}\nExisting pillars: ${input.pillars.join(", ") || "none yet"}\n\nIdeas:\n${list}\n\nGive one pillar for every idea id.`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("AI couldn’t sort these ideas.");
  const known = new Set(input.ideas.map((i) => i.id));
  const assignments = (response.parsed_output?.assignments ?? []).filter((a) => known.has(a.id) && a.pillar.trim()).map((a) => ({ id: a.id, pillar: a.pillar.trim().slice(0, 60) }));
  return { assignments, usage: response.usage, model: response.model };
}
