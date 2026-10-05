// Plans, prices and invoice maths (PRD 6.20 Billing, OB-10, TM-04, MD-05). Pure, so the
// server, the worker and tests share it.
//
// PRICES ARE DRAFTS. The PRD leaves pricing open ("per space with included seats; 14-day
// trial"). Change the numbers here; nothing else needs to change. Amounts are per active space
// per month, in whole rupees and dollars.

export const DRAFT_PRICES = true;

export type PlanId = "starter" | "growth" | "agency";
export type Interval = "month" | "year";
export type Currency = "INR" | "USD";

export interface Plan {
  id: PlanId;
  name: string;
  blurb: string;
  perSpace: Record<Currency, number>;
  seatsPerSpace: number;
  creditsPerSpace: number;
  storageGbPerSpace: number;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    blurb: "For a brand or a freelancer with a few clients",
    perSpace: { INR: 999, USD: 15 },
    seatsPerSpace: 2,
    creditsPerSpace: 300,
    storageGbPerSpace: 5,
    features: ["Instagram and Facebook publishing", "Calendar, Board and Table", "Client review links", "First audit and analytics"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    blurb: "For small agencies running several clients",
    perSpace: { INR: 2499, USD: 35 },
    seatsPerSpace: 5,
    creditsPerSpace: 1000,
    storageGbPerSpace: 25,
    features: ["Everything in Starter", "AI Copilot and Strategy tools", "Projects, tasks and templates", "Your branding on review pages"],
  },
  agency: {
    id: "agency",
    name: "Agency",
    blurb: "For agencies with large teams and many clients",
    perSpace: { INR: 4999, USD: 69 },
    seatsPerSpace: 10,
    creditsPerSpace: 3000,
    storageGbPerSpace: 100,
    features: ["Everything in Growth", "More seats, AI credits and storage per space", "Priority support"],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
/** Seats beyond what the spaces include, per month. */
export const EXTRA_SEAT: Record<Currency, number> = { INR: 299, USD: 5 };
/** Paying yearly costs 10 months: two months free. */
export const MONTHS_PER_YEAR_BILLED = 10;
/** During the trial everything works with Growth's limits. */
export const TRIAL_PLAN: PlanId = "growth";
export const GST_RATE = 0.18;

/** The seller on GST invoices. Draft details until the business is registered. */
export const SELLER = {
  name: "Growth OS (draft seller details)",
  address: "New Delhi, Delhi 110001, India",
  gstin: null as string | null,
  stateCode: "07",
};

export const currencyFor = (country: string): Currency => (country === "IN" ? "INR" : "USD");

/** Integer minor units (paise, cents) to avoid rounding errors. */
const minor = (whole: number) => Math.round(whole * 100);

export function formatMoney(minorUnits: number, currency: Currency) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: minorUnits % 100 === 0 ? 0 : 2 }).format(minorUnits / 100);
}

/** What a plan allows for a number of active spaces (TM-04, MD-05, AI-13). */
export function limitsFor(planId: PlanId, spaces: number, extraSeats = 0) {
  const p = PLANS[planId];
  const n = Math.max(1, spaces);
  return {
    seats: p.seatsPerSpace * n + extraSeats,
    credits: p.creditsPerSpace * n,
    storageBytes: p.storageGbPerSpace * n * 1024 ** 3,
  };
}

/* ---------- GST (India) ---------- */

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isGstin = (v: string) => GSTIN.test(v.trim().toUpperCase());
/** A GSTIN starts with the state code ("07" Delhi, "27" Maharashtra…). */
export const gstState = (gstin: string | null | undefined) => (gstin && isGstin(gstin) ? gstin.slice(0, 2) : null);

export interface Line {
  label: string;
  quantity: number;
  unit: number;
  amount: number;
}
export interface Tax {
  label: string;
  rate: number;
  amount: number;
}
export interface Quote {
  currency: Currency;
  lines: Line[];
  subtotal: number;
  taxes: Tax[];
  total: number;
}

/**
 * One period's charge: each active space at the plan's price, plus extra seats. In India GST is
 * added: CGST and SGST within the seller's state, IGST otherwise (the buyer's state comes from
 * their GSTIN, or their billing state when they have none).
 */
export function quote(input: { plan: PlanId; interval: Interval; spaces: number; extraSeats: number; currency: Currency; buyerStateCode?: string | null }): Quote {
  const p = PLANS[input.plan];
  const months = input.interval === "year" ? MONTHS_PER_YEAR_BILLED : 1;
  const per = input.interval === "year" ? "year" : "month";
  const spaces = Math.max(1, input.spaces);
  const lines: Line[] = [
    { label: `${p.name} plan, per space per ${per}`, quantity: spaces, unit: minor(p.perSpace[input.currency] * months), amount: 0 },
  ];
  if (input.extraSeats > 0) lines.push({ label: `Extra seats, per seat per ${per}`, quantity: input.extraSeats, unit: minor(EXTRA_SEAT[input.currency] * months), amount: 0 });
  for (const l of lines) l.amount = l.unit * l.quantity;
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const taxes: Tax[] = [];
  if (input.currency === "INR") {
    if (input.buyerStateCode && input.buyerStateCode === SELLER.stateCode) {
      const half = Math.round((subtotal * GST_RATE) / 2);
      taxes.push({ label: "CGST", rate: GST_RATE / 2, amount: half }, { label: "SGST", rate: GST_RATE / 2, amount: half });
    } else {
      taxes.push({ label: "IGST", rate: GST_RATE, amount: Math.round(subtotal * GST_RATE) });
    }
  }
  return { currency: input.currency, lines, subtotal, taxes, total: subtotal + taxes.reduce((a, t) => a + t.amount, 0) };
}

/** The end of a billing period that starts at `from`. */
export function periodEnd(from: Date, interval: Interval) {
  const d = new Date(from);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else {
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + 1);
    // 31 Jan + 1 month is 28/29 Feb, not 2/3 Mar.
    if (d.getUTCDate() !== day) d.setUTCDate(0);
  }
  return d;
}

/* ---------- Where an organisation stands ---------- */

export type Phase = "trial" | "active" | "past_due" | "canceling" | "expired";

export interface SubscriptionLike {
  plan: PlanId;
  status: "active" | "past_due" | "canceled";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  extraSeats: number;
}

/**
 * OB-10: in the trial, then on a plan, or expired (the trial ran out, or a cancelled plan
 * ended). Expired organisations can look but not change anything until they choose a plan.
 */
export function phaseOf(sub: SubscriptionLike | null, trialEndsAt: Date | null, now: Date): { phase: Phase; plan: PlanId; locked: boolean } {
  if (sub && sub.status !== "canceled" && sub.currentPeriodEnd > now) {
    return { phase: sub.status === "past_due" ? "past_due" : sub.cancelAtPeriodEnd ? "canceling" : "active", plan: sub.plan, locked: false };
  }
  // A few days' grace for a failed renewal before locking.
  if (sub && sub.status === "past_due" && now.getTime() - sub.currentPeriodEnd.getTime() < 7 * 864e5) return { phase: "past_due", plan: sub.plan, locked: false };
  if (!sub && (!trialEndsAt || trialEndsAt > now)) return { phase: "trial", plan: TRIAL_PLAN, locked: false };
  return { phase: "expired", plan: sub?.plan ?? TRIAL_PLAN, locked: true };
}
