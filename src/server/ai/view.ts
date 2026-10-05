import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import { withOrg } from "@/db";
import { aiActions, aiMessages, spaces } from "@/db/schema";
import { labelClaims, type Segment } from "@/lib/ai/claims";
import { postsById } from "./service";
import { PROPOSAL_TOOLS, TOOL_LABELS } from "./tools";

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

export interface ActionView {
  id: string;
  tool: "propose_draft_posts" | "propose_captions";
  state: "proposed" | "executed" | "dismissed" | "failed" | "undone";
  spaceSlug: string;
  spaceName: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  posts: { id: string; title: string; caption: string }[];
}

export type TurnView =
  | { kind: "user"; text: string }
  | { kind: "assistant"; parts: ({ type: "text"; segments: Segment[] } | { type: "tool"; label: string } | { type: "action"; action: ActionView })[] };

const APP_NOTE = /^\[App note about earlier cards\]/;

/** The stored conversation as the page shows it, with claims labelled and verified (AI-07). */
export async function conversationView(orgId: string, conversationId: string): Promise<TurnView[]> {
  const { rows, actions } = await withOrg(orgId, async (tx) => {
    const rows = await tx.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.createdAt));
    const actions = await tx
      .select({ action: aiActions, spaceSlug: spaces.slug, spaceName: spaces.name })
      .from(aiActions)
      .innerJoin(spaces, eq(spaces.id, aiActions.spaceId))
      .where(eq(aiActions.conversationId, conversationId));
    return { rows, actions };
  });
  const captionPostIds = actions.flatMap((a) =>
    a.action.tool === "propose_captions" ? ((a.action.payload as { changes: { post_id: string }[] }).changes ?? []).map((c) => c.post_id) : [],
  );
  const posts = await postsById(orgId, captionPostIds);

  const turns: TurnView[] = [];
  const toolResults: string[] = [];
  for (const row of rows) {
    const blocks = (typeof row.content === "string" ? [{ type: "text", text: row.content }] : row.content) as Block[];
    if (row.role === "user") {
      for (const b of blocks) {
        if (b.type === "tool_result") toolResults.push(typeof b.content === "string" ? b.content : JSON.stringify(b.content));
      }
      const text = blocks
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlockParam => b.type === "text" && !APP_NOTE.test(b.text))
        .map((b) => b.text)
        .join("\n");
      if (text) turns.push({ kind: "user", text });
      continue;
    }
    let turn = turns.at(-1);
    if (!turn || turn.kind !== "assistant") {
      turn = { kind: "assistant", parts: [] };
      turns.push(turn);
    }
    for (const b of blocks) {
      if (b.type === "text" && b.text.trim()) turn.parts.push({ type: "text", segments: labelClaims(b.text, toolResults) });
      if (b.type === "tool_use") {
        const found = PROPOSAL_TOOLS.has(b.name) ? actions.find((a) => a.action.toolUseId === b.id) : undefined;
        if (found) {
          const ids = found.action.tool === "propose_captions" ? ((found.action.payload as { changes: { post_id: string }[] }).changes ?? []).map((c) => c.post_id) : [];
          turn.parts.push({
            type: "action",
            action: {
              id: found.action.id,
              tool: found.action.tool as ActionView["tool"],
              state: found.action.state,
              spaceSlug: found.spaceSlug,
              spaceName: found.spaceName,
              payload: found.action.payload as Record<string, unknown>,
              result: found.action.result as Record<string, unknown> | null,
              posts: posts.filter((p) => ids.includes(p.id)),
            },
          });
        } else if (!PROPOSAL_TOOLS.has(b.name)) {
          turn.parts.push({ type: "tool", label: TOOL_LABELS[b.name] ?? b.name });
        }
      }
    }
  }
  return turns;
}

export async function spaceSlugsById(orgId: string, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await withOrg(orgId, (tx) => tx.select({ id: spaces.id, slug: spaces.slug }).from(spaces).where(inArray(spaces.id, ids)));
  return new Map(rows.map((r) => [r.id, r.slug]));
}
