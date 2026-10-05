// Billing records shared by the web server and the job worker (no Next.js imports).
import { and, count, eq, gt, isNull, like, lte, sql } from "drizzle-orm";
import { withOrg, type Db, type Tx } from "@/db/core";
import { invites, invoices, mediaAssets, memberships, organizations, spaces, subscriptions } from "@/db/schema";
import { currencyFor, gstState, limitsFor, periodEnd, quote, type Currency, type Interval, type PlanId } from "@/lib/billing/plans";

type Org = typeof organizations.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;

/** What the organisation uses now: billed spaces, seats (members plus pending invites) and storage. */
export async function usageOf(tx: Tx, now = new Date()) {
  const [[{ activeSpaces }], [{ members }], [{ pending }], [{ storage }]] = await Promise.all([
    tx.select({ activeSpaces: count() }).from(spaces).where(and(isNull(spaces.archivedAt), isNull(spaces.deletedAt))),
    tx.select({ members: count() }).from(memberships),
    tx.select({ pending: count() }).from(invites).where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now))),
    tx.select({ storage: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)::bigint` }).from(mediaAssets),
  ]);
  return { activeSpaces, members, pendingInvites: pending, seatsUsed: members + pending, storageBytes: Number(storage) };
}

export type Usage = Awaited<ReturnType<typeof usageOf>>;

/** "GOS-2026-0007": numbered per organisation per year. */
async function nextNumber(tx: Tx, year: number) {
  const prefix = `GOS-${year}-`;
  const [{ n }] = await tx.select({ n: count() }).from(invoices).where(like(invoices.number, `${prefix}%`));
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

/** Issues the invoice for a period at today's usage and the plan's price. */
export async function issueInvoice(tx: Tx, org: Org, sub: Pick<Subscription, "plan" | "interval" | "currency" | "extraSeats">, period: { start: Date; end: Date }, opts: { paid: boolean; now: Date }) {
  const usage = await usageOf(tx, opts.now);
  const details = org.billingDetails;
  const q = quote({
    plan: sub.plan,
    interval: sub.interval,
    currency: sub.currency,
    spaces: usage.activeSpaces,
    extraSeats: sub.extraSeats,
    buyerStateCode: gstState(details.gstin) ?? details.stateCode ?? null,
  });
  const [row] = await tx
    .insert(invoices)
    .values({
      orgId: org.id,
      number: await nextNumber(tx, opts.now.getUTCFullYear()),
      status: opts.paid ? "paid" : "open",
      currency: q.currency,
      periodStart: period.start,
      periodEnd: period.end,
      lines: q.lines,
      taxes: q.taxes,
      subtotal: q.subtotal,
      total: q.total,
      billedTo: { name: org.name, legalName: details.legalName, gstin: details.gstin, email: details.email, address: details.address },
      issuedAt: opts.now,
      paidAt: opts.paid ? opts.now : null,
    })
    .returning();
  return row;
}

/** The plan's AI allowance becomes the organisation's monthly budget (AI-13); Admins can still lower it. */
export async function syncCredits(tx: Tx, orgId: string, plan: PlanId, extraSeats: number, now = new Date()) {
  const usage = await usageOf(tx, now);
  await tx.update(organizations).set({ aiMonthlyCredits: limitsFor(plan, usage.activeSpaces, extraSeats).credits }).where(eq(organizations.id, orgId));
}

/** Starts a plan: the first period's invoice is issued and, with the sample provider, paid at once. */
export async function startPlan(
  tx: Tx,
  org: Org,
  input: { plan: PlanId; interval: Interval; extraSeats: number; paymentMethod: { kind: "card" | "upi"; label: string }; now: Date },
) {
  const currency: Currency = currencyFor(org.country);
  const start = input.now;
  const end = periodEnd(start, input.interval);
  const values = {
    plan: input.plan,
    interval: input.interval,
    currency,
    status: "active" as const,
    extraSeats: input.extraSeats,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    provider: "sample" as const,
    paymentMethod: input.paymentMethod,
    updatedAt: start,
  };
  const [existing] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, org.id));
  const [sub] = existing
    ? await tx.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id)).returning()
    : await tx.insert(subscriptions).values({ orgId: org.id, ...values }).returning();
  const invoice = await issueInvoice(tx, org, sub, { start, end }, { paid: true, now: start });
  await syncCredits(tx, org.id, input.plan, input.extraSeats, start);
  return { sub, invoice };
}

/**
 * Run by the worker: renews sample subscriptions whose period ended, or ends the ones set to
 * cancel. Razorpay and Stripe renew on their side and tell us by webhook (not connected yet).
 */
export async function renewDue(db: Db, now = new Date()) {
  const due = await db.select().from(subscriptions).where(and(lte(subscriptions.currentPeriodEnd, now), eq(subscriptions.status, "active"), eq(subscriptions.provider, "sample")));
  for (const sub of due) {
    await withOrg(db, sub.orgId, async (tx) => {
      if (sub.cancelAtPeriodEnd) {
        await tx.update(subscriptions).set({ status: "canceled", updatedAt: now }).where(eq(subscriptions.id, sub.id));
        return;
      }
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, sub.orgId));
      const start = sub.currentPeriodEnd;
      const end = periodEnd(start, sub.interval);
      await issueInvoice(tx, org, sub, { start, end }, { paid: true, now });
      await tx.update(subscriptions).set({ currentPeriodStart: start, currentPeriodEnd: end, updatedAt: now }).where(eq(subscriptions.id, sub.id));
      await syncCredits(tx, sub.orgId, sub.plan, sub.extraSeats, now);
    });
  }
  return due.length;
}
