"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { WORKFLOW_TEMPLATES } from "@/ai/workflows";
import { createWorkflow, deletePersona, deletePrompt, deleteWorkflow, runWorkflowNow, savePersona, savePrompt, setWorkflowEnabled } from "@/server/ai-tools";
import { getOrgContext } from "@/server/tenancy";

// AI › Prompts, Persona and Workflows.

export type ToolResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const uuid = z.uuid();

async function run<T extends object>(org: string, fn: (ctx: Awaited<ReturnType<typeof getOrgContext>>) => Promise<T | void>): Promise<ToolResult<T>> {
  try {
    const out = (await fn(await getOrgContext(org))) ?? ({} as T);
    revalidatePath(`/o/${org}/ai`, "layout");
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check what you entered.") : e instanceof Error ? e.message : "Something went wrong." };
  }
}

const Prompt = z.object({ id: uuid.optional(), title: z.string().trim().min(1, "Give the prompt a name.").max(120), body: z.string().trim().min(5, "Write the prompt.").max(4000) });

export async function savePromptAction(org: string, raw: unknown) {
  return run(org, (ctx) => savePrompt(ctx, Prompt.parse(raw)));
}

export async function deletePromptAction(org: string, id: string) {
  return run(org, (ctx) => deletePrompt(ctx, uuid.parse(id)));
}

const text = (max: number) => z.string().trim().max(max);
const PersonaInput = z.object({
  role: text(200),
  about: text(3000),
  voice: text(2000),
  avoid: text(1000),
  website: z.union([z.literal(""), z.url("Use a full web address, like https://example.com.").max(300)]),
});

export async function savePersonaAction(org: string, raw: unknown) {
  return run(org, (ctx) => savePersona(ctx, PersonaInput.parse(raw)));
}

export async function deletePersonaAction(org: string) {
  return run(org, (ctx) => deletePersona(ctx));
}

const Workflow = z.object({
  kind: z.enum(Object.keys(WORKFLOW_TEMPLATES) as [keyof typeof WORKFLOW_TEMPLATES, ...(keyof typeof WORKFLOW_TEMPLATES)[]]),
  space: z.string().max(80).nullable(),
  name: text(120),
  prompt: text(2000),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
});

export async function createWorkflowAction(org: string, raw: unknown) {
  return run(org, async (ctx) => ({ id: (await createWorkflow(ctx, Workflow.parse(raw))).id }));
}

export async function toggleWorkflowAction(org: string, id: string, enabled: boolean) {
  return run(org, (ctx) => setWorkflowEnabled(ctx, uuid.parse(id), z.boolean().parse(enabled)));
}

export async function deleteWorkflowAction(org: string, id: string) {
  return run(org, (ctx) => deleteWorkflow(ctx, uuid.parse(id)));
}

export async function runNowAction(org: string, id: string) {
  return run(org, async (ctx) => ({ runId: (await runWorkflowNow(ctx, uuid.parse(id))).id }));
}
