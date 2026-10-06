// AI Copilot chat: streams one turn as newline-delimited JSON events (PRD 6.14).
import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withOrg } from "@/db";
import { aiConversations, aiMessages, spaces } from "@/db/schema";
import { REASONING } from "@/lib/ai/config";
import { copilotTurn } from "@/server/ai/loop";
import { AI_SETUP_MESSAGE, aiErrorMessage, anthropic, cardNotes, copilotSystem, creditsUsedThisMonth, loadHistory, recordUsage } from "@/server/ai/service";
import { COPILOT_TOOLS, runTool } from "@/server/ai/tools";
import { getPersona, personaText } from "@/server/ai-tools";
import { orgContextForRoute, spaceContextForRoute } from "@/server/tenancy";

const Body = z.object({
  conversationId: z.uuid().optional(),
  space: z.string().max(80).optional(),
  message: z.string().trim().min(1).max(4000),
  reasoning: z.enum(Object.keys(REASONING) as [keyof typeof REASONING, ...(keyof typeof REASONING)[]]).default("balanced"),
});

const ROLE = { owner: "Owner", admin: "Admin", manager: "Manager", editor: "Editor" } as const;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest, { params }: RouteContext<"/api/o/[org]/ai/chat">) {
  const { org } = await params;
  const { ctx, status } = await orgContextForRoute(org);
  if (!ctx) return fail(status, "Sign in to use AI Copilot.");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Write a message first.");

  const api = anthropic();
  if (!api) return fail(503, AI_SETUP_MESSAGE);
  if ((await creditsUsedThisMonth(ctx.org.id)) >= ctx.org.aiMonthlyCredits) {
    return fail(402, "This month’s AI budget is used up. An Owner or Admin can raise it in AI settings.");
  }

  // The conversation's scope: an existing conversation keeps its own (AI-02).
  let conversation = body.data.conversationId
    ? (await withOrg(ctx.org.id, (tx) => tx.select().from(aiConversations).where(eq(aiConversations.id, body.data.conversationId!))))[0]
    : undefined;
  if (body.data.conversationId && (!conversation || conversation.userId !== ctx.user.id)) return fail(404, "Conversation not found.");
  const spaceSlug = conversation?.spaceId
    ? (await withOrg(ctx.org.id, (tx) => tx.select({ slug: spaces.slug }).from(spaces).where(eq(spaces.id, conversation!.spaceId!))))[0]?.slug
    : body.data.space;
  let space: { id: string; name: string; slug: string; timezone: string } | null = null;
  if (spaceSlug) {
    const r = await spaceContextForRoute(org, spaceSlug, "ai.use");
    if (!r.ctx) return fail(r.status === 403 ? 403 : 404, "You can’t use AI Copilot in that space.");
    space = r.ctx.space;
  }

  if (!conversation) {
    [conversation] = await withOrg(ctx.org.id, (tx) =>
      tx.insert(aiConversations).values({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: space?.id ?? null, title: body.data.message.slice(0, 60) }).returning(),
    );
  }
  const conversationId = conversation.id;

  const [last] = await withOrg(ctx.org.id, (tx) =>
    tx.select({ at: aiMessages.createdAt }).from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(desc(aiMessages.createdAt)).limit(1),
  );
  const note = await cardNotes(ctx.org.id, conversationId, last?.at ?? null);
  const persist = (role: "user" | "assistant", content: unknown) =>
    withOrg(ctx.org.id, (tx) => tx.insert(aiMessages).values({ orgId: ctx.org.id, conversationId, role, content })).then(() => undefined);
  const userContent = [...(note ? [{ type: "text" as const, text: note }] : []), { type: "text" as const, text: body.data.message }];
  const history = await loadHistory(ctx.org.id, conversationId);
  await persist("user", userContent);
  history.push({ role: "user", content: userContent });

  const tz = space?.timezone ?? ctx.org.timezone;
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(new Date());
  const persona = personaText(await getPersona(ctx.org.id, ctx.user.id));
  const system = copilotSystem({ orgName: ctx.org.name, userName: ctx.user.name, role: ROLE[ctx.role], space, today: `${today} (${tz})`, persona });
  const scope = { orgSlug: org, orgId: ctx.org.id, userId: ctx.user.id, conversationId, spaceSlug: space?.slug ?? null };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "conversation", id: conversationId });
      try {
        for await (const event of copilotTurn(
          {
            client: api,
            persist,
            runTool: (name, input, id) => runTool(scope, name, input, id),
            meter: (model, usage) => recordUsage({ orgId: ctx.org.id, userId: ctx.user.id, spaceId: space?.id ?? null, kind: "copilot", model, usage }),
          },
          { history, system, tools: COPILOT_TOOLS, effort: REASONING[body.data.reasoning].effort },
        )) {
          send(event);
        }
      } catch (e) {
        console.error("Copilot turn failed", e);
        send({ type: "error", message: aiErrorMessage(e) });
      } finally {
        await withOrg(ctx.org.id, (tx) => tx.update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversationId)));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
