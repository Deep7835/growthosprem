"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changePlan, saveDetails, setCancel, subscribe } from "@/server/billing";
import { getOrgContext } from "@/server/tenancy";

// Billing changes: the Owner only (checked again in src/server/billing.ts).

export type BillingResult = { ok: true } | { ok: false; error: string };

const plan = z.enum(["starter", "growth", "agency"]);
const interval = z.enum(["month", "year"]);

async function run(org: string, fn: (ctx: Awaited<ReturnType<typeof getOrgContext>>) => Promise<unknown>): Promise<BillingResult> {
  try {
    const ctx = await getOrgContext(org);
    await fn(ctx);
    revalidatePath(`/o/${org}`, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Something in that form isn’t valid." };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save. Try again." };
  }
}

export async function choosePlan(org: string, input: { plan: string; interval: string; extraSeats: number; method: string }) {
  return run(org, (ctx) =>
    subscribe(ctx, {
      plan: plan.parse(input.plan),
      interval: interval.parse(input.interval),
      extraSeats: z.number().int().min(0).max(500).parse(input.extraSeats),
      method: z.enum(["card", "upi"]).parse(input.method),
    }),
  );
}

export async function updatePlan(org: string, input: { plan?: string; interval?: string; extraSeats?: number }) {
  return run(org, (ctx) =>
    changePlan(ctx, {
      plan: input.plan === undefined ? undefined : plan.parse(input.plan),
      interval: input.interval === undefined ? undefined : interval.parse(input.interval),
      extraSeats: input.extraSeats === undefined ? undefined : z.number().int().min(0).max(500).parse(input.extraSeats),
    }),
  );
}

export async function cancelPlan(org: string, cancel: boolean) {
  return run(org, (ctx) => setCancel(ctx, z.boolean().parse(cancel)));
}

export async function saveBillingDetails(org: string, input: { legalName: string; gstin: string; email: string; address: string; stateCode: string }) {
  const s = z.string().max(300);
  return run(org, (ctx) => saveDetails(ctx, { legalName: s.parse(input.legalName), gstin: s.parse(input.gstin), email: s.parse(input.email), address: s.parse(input.address), stateCode: s.parse(input.stateCode) }));
}
