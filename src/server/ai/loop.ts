// The Copilot's tool loop (PRD 6.14). No Next.js imports: the API client, storage and
// tool runner are passed in, so tests can drive it with a scripted client.
import Anthropic from "@anthropic-ai/sdk";
import { COPILOT_MODEL, type TokenUsage } from "@/lib/ai/config";

export type CopilotEvent =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; status: "running" | "done" | "error" }
  | { type: "action"; actionId: string }
  | { type: "usage"; credits: number }
  | { type: "refusal"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface LoopDeps {
  client: { beta: { messages: { stream: (params: Anthropic.Beta.Messages.MessageCreateParamsStreaming) => AsyncIterable<Anthropic.Beta.Messages.BetaRawMessageStreamEvent> & { finalMessage(): Promise<Anthropic.Beta.Messages.BetaMessage> } } } };
  /** Appends one message to the stored conversation, exactly as given. */
  persist: (role: "user" | "assistant", content: Anthropic.Beta.Messages.BetaMessageParam["content"]) => Promise<void>;
  runTool: (name: string, input: unknown, toolUseId: string) => Promise<{ content: string; isError?: boolean; actionId?: string }>;
  /** Records usage against the budget; returns credits charged. */
  meter: (model: string, usage: TokenUsage) => Promise<number>;
}

export interface TurnInput {
  history: Anthropic.Beta.Messages.BetaMessageParam[];
  system: Anthropic.Beta.Messages.BetaTextBlockParam[];
  tools: Anthropic.Beta.Messages.BetaTool[];
  effort: "low" | "medium" | "high" | "xhigh";
}

const MAX_STEPS = 8;

export async function* copilotTurn(deps: LoopDeps, input: TurnInput): AsyncGenerator<CopilotEvent> {
  const messages = [...input.history];
  let parseRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = deps.client.beta.messages.stream({
      model: COPILOT_MODEL,
      max_tokens: 32000,
      system: input.system,
      tools: input.tools,
      messages,
      output_config: { effort: input.effort },
      cache_control: { type: "ephemeral" },
      // On a safety decline, Anthropic re-runs the request on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield { type: "text", text: event.delta.text };
    }

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await stream.finalMessage();
      parseRetries = 0;
    } catch (err) {
      // Eager tool input that could not be parsed: re-issue the turn, at most twice.
      if (err instanceof Anthropic.APIError || parseRetries++ >= 2) throw err;
      continue;
    }

    yield { type: "usage", credits: await deps.meter(message.model, message.usage) };

    if (message.stop_reason === "refusal") {
      yield { type: "refusal", message: "AI Copilot can’t help with that request. Try rephrasing it." };
      return;
    }

    // The assistant turn is stored and replayed verbatim (thinking and fallback blocks included).
    await deps.persist("assistant", message.content as Anthropic.Beta.Messages.BetaMessageParam["content"]);
    messages.push({ role: "assistant", content: message.content as Anthropic.Beta.Messages.BetaMessageParam["content"] });

    if (message.stop_reason === "pause_turn") continue;
    const toolUses = message.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;
    if (message.stop_reason === "max_tokens") {
      yield { type: "error", message: "The answer was too long and got cut off. Try asking for less at once." };
      return;
    }

    for (const t of toolUses) yield { type: "tool", id: t.id, name: t.name, status: "running" };
    const results = await Promise.all(toolUses.map((t) => deps.runTool(t.name, t.input, t.id)));
    const toolResults: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
    for (const [i, t] of toolUses.entries()) {
      const r = results[i];
      yield { type: "tool", id: t.id, name: t.name, status: r.isError ? "error" : "done" };
      if (r.actionId) yield { type: "action", actionId: r.actionId };
      toolResults.push({ type: "tool_result", tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    // All results in one user message, so parallel tool calls keep working.
    await deps.persist("user", toolResults);
    messages.push({ role: "user", content: toolResults });
  }
  yield { type: "done" };
}
