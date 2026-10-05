import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, withOrg, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { executeAction, undoAction } from "./execute";
import { copilotTurn, type CopilotEvent, type LoopDeps } from "./loop";

type Msg = Anthropic.Beta.Messages.BetaMessage;

/** A stand-in for client.beta.messages.stream that plays back scripted responses. */
function scripted(responses: Partial<Msg>[]) {
  const requests: unknown[] = [];
  const client: LoopDeps["client"] = {
    beta: {
      messages: {
        stream(params) {
          requests.push(structuredClone(params));
          const msg = { model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 200 }, stop_reason: "end_turn", ...responses.shift()! } as Msg;
          const events = msg.content
            .filter((b) => b.type === "text")
            .map((b) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: (b as { text: string }).text } }));
          return Object.assign(
            (async function* () {
              yield* events as Anthropic.Beta.Messages.BetaRawMessageStreamEvent[];
            })(),
            { finalMessage: async () => msg },
          );
        },
      },
    },
  };
  return { client, requests };
}

async function collect(gen: AsyncGenerator<CopilotEvent>) {
  const out: CopilotEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const turnInput = { history: [{ role: "user" as const, content: "How did Cafe do last month?" }], system: [{ type: "text" as const, text: "sys" }], tools: [], effort: "medium" as const };

describe("copilot loop", () => {
  it("runs read tools, feeds results back and stores every turn in order", async () => {
    const { client, requests } = scripted([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "get_analytics", input: { days: 30 } } as never] },
      { content: [{ type: "text", text: "Followers grew 2.6%. [Your data]" } as never] },
    ]);
    const stored: { role: string; content: unknown }[] = [];
    let metered = 0;
    const events = await collect(
      copilotTurn(
        {
          client,
          persist: async (role, content) => void stored.push({ role, content }),
          runTool: async (name) => ({ content: `{"tool":"${name}","growth":"2.6%"}` }),
          meter: async () => ++metered,
        },
        turnInput,
      ),
    );
    expect(stored.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
    expect((stored[1].content as { type: string; tool_use_id: string }[])[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("Followers grew 2.6%. [Your data]");
    expect(events.filter((e) => e.type === "tool").map((e) => (e as { status: string }).status)).toEqual(["running", "done"]);
    expect(metered).toBe(2);
    // The second request replays the first assistant turn and the tool result unchanged.
    const second = requests[1] as { messages: unknown[]; fallbacks: string; betas: string[] };
    expect(second.messages).toHaveLength(3);
    expect(second.fallbacks).toBe("default");
    expect(second.betas).toContain("server-side-fallback-2026-07-01");
  });

  it("reports proposals as action cards", async () => {
    const { client } = scripted([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "p1", name: "propose_draft_posts", input: {} } as never] },
      { content: [{ type: "text", text: "Five drafts are on the card." } as never] },
    ]);
    const events = await collect(copilotTurn({ client, persist: async () => {}, runTool: async () => ({ content: "card", actionId: "a-1" }), meter: async () => 1 }, turnInput));
    expect(events).toContainEqual({ type: "action", actionId: "a-1" });
  });

  it("stops on a refusal without storing the refused turn", async () => {
    const { client } = scripted([{ stop_reason: "refusal", content: [] }]);
    const stored: unknown[] = [];
    const events = await collect(copilotTurn({ client, persist: async (_r, c) => void stored.push(c), runTool: async () => ({ content: "" }), meter: async () => 1 }, turnInput));
    expect(events.some((e) => e.type === "refusal")).toBe(true);
    expect(stored).toEqual([]);
  });
});

describe("action cards", () => {
  let db: Db;
  let orgId: string;
  let cafeId: string;
  let prem: { id: string; name: string };
  let conversationId: string;

  beforeAll(async () => {
    db = await createPgliteDb();
    await seed(db);
    orgId = (await db.select().from(s.organizations))[0].id;
    cafeId = (await db.select().from(s.spaces).where(eq(s.spaces.slug, "cafe")))[0].id;
    const [u] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
    prem = { id: u.id, name: u.name };
    conversationId = (await withOrg(db, orgId, (tx) => tx.insert(s.aiConversations).values({ orgId, userId: prem.id, spaceId: cafeId }).returning()))[0].id;
  }, 30_000);

  const propose = (tool: string, payload: unknown) =>
    withOrg(db, orgId, (tx) => tx.insert(s.aiActions).values({ orgId, conversationId, spaceId: cafeId, toolUseId: `tu-${Math.random()}`, tool, payload }).returning()).then((r) => r[0].id);

  it("creates edited drafts on approval, logs them as the Copilot's, and can undo", async () => {
    const id = await propose("propose_draft_posts", {
      space: "cafe",
      posts: [
        { date: "2026-10-26", time: "18:00", title: "Teaser", placements: ["ig_reel"] },
        { date: "2026-10-28", time: "13:00", title: "Sweets carousel", placements: ["ig_carousel"], caption: "Save this." },
      ],
    });
    // The person removed one row and renamed the other before approving.
    const edited = { space: "cafe", posts: [{ date: "2026-10-28", time: "13:00", title: "5 Diwali sweets", placements: ["ig_carousel"], caption: "Save this." }] };
    const out = await executeAction(db, orgId, id, prem, edited);
    const ids = out.result.contentIds as string[];
    expect(ids).toHaveLength(1);
    const { item, log } = await withOrg(db, orgId, async (tx) => ({
      item: (await tx.select().from(s.contentItems).where(eq(s.contentItems.id, ids[0])))[0],
      log: (await tx.select().from(s.activityLog).where(eq(s.activityLog.targetId, ids[0])))[0],
    }));
    expect(item.title).toBe("5 Diwali sweets");
    expect(item.scheduledAt?.toISOString()).toBe("2026-10-28T07:30:00.000Z"); // 1 PM IST
    expect(log.actorLabel).toBe("AI Copilot for Prem");
    await expect(executeAction(db, orgId, id, prem)).rejects.toThrow(/already handled/);

    await undoAction(db, orgId, id, prem);
    const left = await withOrg(db, orgId, (tx) => tx.select().from(s.contentItems).where(eq(s.contentItems.id, ids[0])));
    expect(left).toEqual([]);
  });

  it("rejects an edited card that breaks the rules", async () => {
    const id = await propose("propose_draft_posts", { space: "cafe", posts: [{ date: "2026-10-26", time: "18:00", title: "Teaser", placements: ["ig_reel"] }] });
    await expect(executeAction(db, orgId, id, prem, { space: "cafe", posts: [{ date: "26/10", time: "6pm", title: "", placements: [] }] })).rejects.toThrow();
  });

  it("updates captions, sends approved posts back to review, and undo restores them", async () => {
    const [brunch] = await withOrg(db, orgId, (tx) => tx.select().from(s.contentItems).where(eq(s.contentItems.title, "Weekend brunch")));
    const id = await propose("propose_captions", { space: "cafe", changes: [{ post_id: brunch.id, caption: "Brunch, but make it Diwali." }] });
    await executeAction(db, orgId, id, prem);
    const after = await withOrg(db, orgId, async (tx) => {
      const [item] = await tx.select().from(s.contentItems).where(eq(s.contentItems.id, brunch.id));
      const [status] = await tx.select().from(s.statuses).where(eq(s.statuses.id, item.statusId));
      return { caption: item.caption, status: status.name };
    });
    expect(after).toEqual({ caption: "Brunch, but make it Diwali.", status: "Client review" });
    await undoAction(db, orgId, id, prem);
    const [restored] = await withOrg(db, orgId, (tx) => tx.select().from(s.contentItems).where(eq(s.contentItems.id, brunch.id)));
    expect(restored.caption).toBe(brunch.caption);
  });
});
