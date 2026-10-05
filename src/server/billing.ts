import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { withOrg } from "@/db";
import { startPlan, syncCredits, usageOf } from "@/billing/core";
import { invoices, organizations, subscriptions } from "@/db/schema";
import { currencyFor, gstState, isGstin, limitsFor, PLANS, quote, type Interval, type PlanId } from "@/lib/billing/plans";
import type { OrgContext } from "./tenancy";

// Billing (PRD 6.20). Only the Owner manages it (PRD 4). Payments run in sample mode until
// Razorpay and Stripe keys are added: nothing is charged and no card details are collected.

export const billingLive = () => Boolean(process.env.RAZORPAY_KEY_ID || process.env.STRIPE_SECRET_KEY);

function requireOwner(ctx: OrgContext) {
  if (ctx.role !== "owner") throw new Error("Only the Owner can change billing.");
}

export async function loadBilling(ctx: OrgContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const now = new Date(ctx.requestTime);
    const [[sub], usage, list] = await Promise.all([
      tx.select().from(subscriptions).where(eq(subscriptions.orgId, ctx.org.id)),
      usageOf(tx, now),
      tx.select().from(invoices).orderBy(desc(invoices.issuedAt)).limit(50),
    ]);
    const currency = sub?.currency ?? currencyFor(ctx.org.country);
    const plan = ctx.billing.plan;
    const limits = limitsFor(plan, usage.activeSpaces, sub?.extraSeats ?? 0);
    const details = ctx.org.billingDetails;
    const buyerState = gstState(details.gstin) ?? details.stateCode ?? null;
    // What the next invoice will be at today's usage.
    const next = sub && sub.status !== "canceled" && !sub.cancelAtPeriodEnd ? quote({ plan: sub.plan, interval: sub.interval, currency, spaces: usage.activeSpaces, extraSeats: sub.extraSeats, buyerStateCode: buyerState }) : null;
    return {
      phase: ctx.billing.phase,
      plan,
      currency,
      trialEndsAt: ctx.org.trialEndsAt?.toISOString() ?? null,
      subscription: sub
        ? {
            plan: sub.plan,
            interval: sub.interval,
            status: sub.status,
            extraSeats: sub.extraSeats,
            currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            paymentMethod: sub.paymentMethod,
            provider: sub.provider,
          }
        : null,
      usage,
      limits,
      next,
      details,
      buyerState,
      invoices: list.map((i) => ({ id: i.id, number: i.number, status: i.status, total: i.total, currency: i.currency, issuedAt: i.issuedAt.toISOString(), periodStart: i.periodStart.toISOString(), periodEnd: i.periodEnd.toISOString() })),
      live: billingLive(),
    };
  });
}

export type BillingView = Awaited<ReturnType<typeof loadBilling>>;

/** "Choose plan": the sample checkout. The first period is invoiced and marked paid at once. */
export async function subscribe(ctx: OrgContext, input: { plan: PlanId; interval: Interval; extraSeats: number; method: "card" | "upi" }) {
  requireOwner(ctx);
  if (!(input.plan in PLANS)) throw new Error("Pick a plan.");
  if (billingLive()) throw new Error("Live payments aren’t connected yet. Remove the payment keys to use sample mode.");
  return withOrg(ctx.org.id, async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, ctx.org.id));
    if (sub && sub.status !== "canceled" && sub.currentPeriodEnd > new Date()) throw new Error("There’s already a plan. Change it instead.");
    const usage = await usageOf(tx);
    const limit = limitsFor(input.plan, usage.activeSpaces, input.extraSeats).seats;
    if (usage.seatsUsed > limit) throw new Error(`You have ${usage.seatsUsed} people and invites but this would allow ${limit}. Add ${usage.seatsUsed - limit} extra seat${usage.seatsUsed - limit === 1 ? "" : "s"}.`);
    const label = input.method === "upi" ? "UPI (sample)" : "Card (sample)";
    return startPlan(tx, ctx.org, { ...input, paymentMethod: { kind: input.method, label }, now: new Date() });
  });
}

/**
 * Change plan, period or extra seats. New limits apply now; the new price applies from the next
 * renewal (no proration in sample mode).
 */
export async function changePlan(ctx: OrgContext, change: { plan?: PlanId; interval?: Interval; extraSeats?: number }) {
  requireOwner(ctx);
  await withOrg(ctx.org.id, async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, ctx.org.id));
    if (!sub || sub.status === "canceled") throw new Error("Choose a plan first.");
    const plan = change.plan ?? sub.plan;
    const extraSeats = Math.max(0, Math.min(500, Math.round(change.extraSeats ?? sub.extraSeats)));
    const usage = await usageOf(tx);
    const limit = limitsFor(plan, usage.activeSpaces, extraSeats).seats;
    if (usage.seatsUsed > limit) throw new Error(`That allows ${limit} seats but ${usage.seatsUsed} are in use. Remove people or keep more seats.`);
    await tx.update(subscriptions).set({ plan, interval: change.interval ?? sub.interval, extraSeats, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await syncCredits(tx, ctx.org.id, plan, extraSeats);
  });
}

/** Cancel at the end of the period, or undo that before it ends. */
export async function setCancel(ctx: OrgContext, cancel: boolean) {
  requireOwner(ctx);
  await withOrg(ctx.org.id, async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(and(eq(subscriptions.orgId, ctx.org.id), eq(subscriptions.status, "active")));
    if (!sub) throw new Error("There’s no active plan.");
    await tx.update(subscriptions).set({ cancelAtPeriodEnd: cancel, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
  });
}

/** GST details for invoices. A GSTIN sets the state, which decides CGST and SGST or IGST. */
export async function saveDetails(ctx: OrgContext, input: { legalName: string; gstin: string; email: string; address: string; stateCode: string }) {
  requireOwner(ctx);
  const gstin = input.gstin.trim().toUpperCase();
  if (gstin && !isGstin(gstin)) throw new Error("That GSTIN doesn’t look right. It has 15 characters, like 07ABCDE1234F1Z5.");
  const stateCode = gstState(gstin) ?? (/^\d{2}$/.test(input.stateCode) ? input.stateCode : "");
  const details = {
    legalName: input.legalName.trim().slice(0, 120) || undefined,
    gstin: gstin || undefined,
    email: input.email.trim().slice(0, 200) || undefined,
    address: input.address.trim().slice(0, 300) || undefined,
    stateCode: stateCode || undefined,
  };
  await withOrg(ctx.org.id, (tx) => tx.update(organizations).set({ billingDetails: details }).where(eq(organizations.id, ctx.org.id)));
}

export async function getInvoice(ctx: OrgContext, id: string) {
  const [row] = await withOrg(ctx.org.id, (tx) => tx.select().from(invoices).where(eq(invoices.id, id)));
  return row ?? null;
}

/** TM-04: refuses invites that would go over the plan's seats. */
export async function checkSeats(ctx: OrgContext, adding: number) {
  const { usage, limits } = await withOrg(ctx.org.id, async (tx) => {
    const usage = await usageOf(tx);
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, ctx.org.id));
    return { usage, limits: limitsFor(ctx.billing.plan, usage.activeSpaces, sub?.extraSeats ?? 0) };
  });
  if (usage.seatsUsed + adding > limits.seats) {
    const left = Math.max(0, limits.seats - usage.seatsUsed);
    throw new Error(
      `${left === 0 ? "All" : `Only ${left} of`} ${limits.seats} seats ${left === 0 ? "are in use" : "are free"} on the ${PLANS[ctx.billing.plan].name} plan. ${ctx.role === "owner" ? "Add seats or upgrade in Settings › Billing." : "Ask the Owner to add seats or upgrade."}`,
    );
  }
}

/** MD-05: the storage the plan allows for the organisation. */
export async function storageLimit(ctx: OrgContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const usage = await usageOf(tx);
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, ctx.org.id));
    return limitsFor(ctx.billing.plan, usage.activeSpaces, sub?.extraSeats ?? 0).storageBytes;
  });
}
