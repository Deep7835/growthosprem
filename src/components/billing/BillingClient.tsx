"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { BillingResult } from "@/app/o/[org]/settings/billing/actions";
import { formatBytes } from "@/lib/media-types";
import { formatMoney, MONTHS_PER_YEAR_BILLED, PLAN_IDS, PLANS, quote, type Interval, type PlanId, type Quote } from "@/lib/billing/plans";
import { GST_STATES } from "@/lib/billing/states";
import type { BillingView } from "@/server/billing";

const dateText = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

function Meter({ label, used, limit, format = (n: number) => n.toLocaleString("en-IN") }: { label: string; used: number; limit: number; format?: (n: number) => string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn-ink" : "bg-ink-2";
  return (
    <div className="flex flex-col gap-1">
      <span className="flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums">
          {format(used)} <span className="font-normal text-muted">of {format(limit)}</span>
        </span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-line-soft" aria-hidden>
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function QuoteTable({ q }: { q: Quote }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {q.lines.map((l) => (
          <tr key={l.label}>
            <td className="py-1 text-muted">
              {l.label} × {l.quantity}
            </td>
            <td className="py-1 text-right tabular-nums">{formatMoney(l.amount, q.currency)}</td>
          </tr>
        ))}
        {q.taxes.map((t) => (
          <tr key={t.label}>
            <td className="py-1 text-muted">
              {t.label} {Math.round(t.rate * 100)}%
            </td>
            <td className="py-1 text-right tabular-nums">{formatMoney(t.amount, q.currency)}</td>
          </tr>
        ))}
        <tr className="border-t border-line-soft font-semibold">
          <td className="pt-2">Total</td>
          <td className="pt-2 text-right tabular-nums">{formatMoney(q.total, q.currency)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** PRD 6.20 Billing, OB-10, TM-04, MD-05. */
export function BillingClient(props: {
  org: string;
  isOwner: boolean;
  view: BillingView;
  choose: (input: { plan: string; interval: string; extraSeats: number; method: string }) => Promise<BillingResult>;
  update: (input: { plan?: string; interval?: string; extraSeats?: number }) => Promise<BillingResult>;
  cancel: (cancel: boolean) => Promise<BillingResult>;
  saveDetails: (input: { legalName: string; gstin: string; email: string; address: string; stateCode: string }) => Promise<BillingResult>;
}) {
  const { view } = props;
  const sub = view.subscription;
  const current = sub && sub.status !== "canceled" ? sub : null;
  const [interval, setInterval] = useState<Interval>(current?.interval ?? "month");
  const [checkout, setCheckout] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const spaces = Math.max(1, view.usage.activeSpaces);
  const cur = view.currency;

  const run = (fn: () => Promise<BillingResult>, done: string, then?: () => void) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { text: done } : { text: r.error, error: true });
      if (r.ok) then?.();
    });

  const status = (() => {
    switch (view.phase) {
      case "trial":
        return { title: "Free trial", body: view.trialEndsAt ? `Everything is on, with the Growth plan’s limits, until ${dateText(view.trialEndsAt)}. Choose a plan before then to keep working without a break.` : "Everything is on, with the Growth plan’s limits." };
      case "active":
        return { title: `${PLANS[current!.plan].name} plan, ${current!.interval === "year" ? "yearly" : "monthly"}`, body: `Renews on ${dateText(current!.currentPeriodEnd)}${current!.paymentMethod ? `, paid with ${current!.paymentMethod.label}` : ""}.` };
      case "canceling":
        return { title: `${PLANS[current!.plan].name} plan, ending`, body: `Cancelled. Everything works until ${dateText(current!.currentPeriodEnd)}, then Plotline becomes read-only.` };
      case "past_due":
        return { title: "Payment due", body: "The last renewal didn’t go through. Update the payment method to avoid interruption." };
      default:
        return { title: sub ? "Plan ended" : "Trial ended", body: "Plotline is read-only: you can look at everything, but nothing can be created, changed or published until you choose a plan. Scheduled posts that were already set to autopost still go out." };
    }
  })();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Billing</h1>
        <p className="text-sm text-muted">Priced per active space, with seats included in each. Archived spaces aren’t billed.</p>
      </div>

      {!view.live && (
        <p className="rounded-xl border border-dashed border-line bg-subtle px-4 py-3 text-sm text-ink-2">
          <strong>Sample mode.</strong> No real payments are taken and no card or UPI details are asked for. Prices are drafts until you set them. Razorpay (India) and Stripe (elsewhere) connect once their keys are added.
        </p>
      )}

      <p aria-live="polite" className={`min-h-5 text-sm ${message?.error ? "text-danger" : "text-muted"}`}>
        {pending ? "Working…" : message?.text}
      </p>

      <section aria-labelledby="billing-status" className={`flex flex-col gap-4 rounded-xl border p-5 ${view.phase === "expired" || view.phase === "past_due" ? "border-danger bg-danger-bg/40" : "border-line bg-surface"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="billing-status" className="text-lg font-semibold">
              {status.title}
            </h2>
            <p className="max-w-xl text-sm text-muted">{status.body}</p>
          </div>
          {props.isOwner && view.phase === "active" && (
            <button type="button" disabled={pending} onClick={() => run(() => props.cancel(true), "Cancelled. It stays on until the end of the period.")} className={buttonClass("ghost", "sm")}>
              Cancel plan
            </button>
          )}
          {props.isOwner && view.phase === "canceling" && (
            <button type="button" disabled={pending} onClick={() => run(() => props.cancel(false), "The plan will renew as usual.")} className={buttonClass("secondary", "sm")}>
              Keep my plan
            </button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Meter label="Seats (people and pending invites)" used={view.usage.seatsUsed} limit={view.limits.seats} />
          <Meter label="Storage" used={view.usage.storageBytes} limit={view.limits.storageBytes} format={formatBytes} />
          <p className="flex justify-between text-sm">
            <span className="text-muted">Active spaces billed</span>
            <span className="font-semibold">{view.usage.activeSpaces}</span>
          </p>
          <p className="flex justify-between text-sm">
            <span className="text-muted">AI credits a month</span>
            <span className="font-semibold">{view.limits.credits.toLocaleString("en-IN")}</span>
          </p>
        </div>
      </section>

      <section aria-labelledby="plans" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="plans" className="text-lg font-semibold">
            {current ? "Change plan" : "Choose a plan"}
          </h2>
          <div role="group" aria-label="Billing period" className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm font-semibold">
            {(["month", "year"] as Interval[]).map((i) => (
              <button key={i} type="button" aria-pressed={interval === i} onClick={() => setInterval(i)} className={`rounded-md px-3 py-1 ${interval === i ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                {i === "month" ? "Monthly" : `Yearly · ${12 - MONTHS_PER_YEAR_BILLED} months free`}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const p = PLANS[id];
            const price = p.perSpace[cur] * (interval === "year" ? MONTHS_PER_YEAR_BILLED : 1) * 100;
            const isCurrent = current?.plan === id;
            const estimate = quote({ plan: id, interval, currency: cur, spaces, extraSeats: current?.extraSeats ?? 0, buyerStateCode: view.buyerState });
            return (
              <article key={id} className={`flex flex-col gap-3 rounded-xl border bg-surface p-4 ${isCurrent ? "border-ink ring-1 ring-ink" : "border-line"}`}>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold">
                    {p.name} {isCurrent && <span className="rounded-full bg-ink px-2 text-xs text-white">Current</span>}
                    {view.phase === "trial" && id === "growth" && <span className="rounded-full bg-subtle px-2 text-xs text-muted">Trial limits</span>}
                  </h3>
                  <p className="text-[13px] text-muted">{p.blurb}</p>
                </div>
                <p>
                  <span className="font-display text-2xl font-bold">{formatMoney(price, cur)}</span>
                  <span className="text-sm text-muted"> per space a {interval === "year" ? "year" : "month"}</span>
                </p>
                <ul className="flex flex-col gap-1 text-[13px]">
                  <li>{p.seatsPerSpace} seats per space</li>
                  <li>{p.creditsPerSpace.toLocaleString("en-IN")} AI credits per space a month</li>
                  <li>{p.storageGbPerSpace} GB storage per space</li>
                  {p.features.map((f) => (
                    <li key={f} className="text-muted">
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-auto text-xs text-muted">
                  For your {spaces} space{spaces === 1 ? "" : "s"}: {formatMoney(estimate.total, cur)} a {interval === "year" ? "year" : "month"}
                  {estimate.taxes.length ? " with GST" : ""}
                </p>
                {props.isOwner &&
                  (current ? (
                    <button
                      type="button"
                      disabled={pending || (isCurrent && current.interval === interval)}
                      onClick={() => run(() => props.update({ plan: id, interval }), `Switched to ${p.name}${interval !== current.interval ? `, ${interval === "year" ? "yearly" : "monthly"}` : ""}. New limits apply now; the new price from your next renewal.`)}
                      className={buttonClass(isCurrent ? "secondary" : "primary", "sm")}
                    >
                      {isCurrent ? (current.interval === interval ? "Current plan" : `Switch to ${interval === "year" ? "yearly" : "monthly"}`) : `Switch to ${p.name}`}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setCheckout(id)} className={buttonClass("primary", "sm")}>
                      Choose {p.name}
                    </button>
                  ))}
              </article>
            );
          })}
        </div>
      </section>

      {current && (
        <section aria-labelledby="seats" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <h2 id="seats" className="font-semibold">
            Extra seats
          </h2>
          <p className="text-sm text-muted">
            Your spaces include {view.limits.seats - current.extraSeats} seats. Each extra seat is {formatMoney(quote({ plan: current.plan, interval: current.interval, currency: cur, spaces: 1, extraSeats: 1 }).lines[1].unit, cur)} a {current.interval === "year" ? "year" : "month"}.
          </p>
          {props.isOwner && (
            <div className="flex items-center gap-2">
              <button type="button" aria-label="One seat fewer" disabled={pending || current.extraSeats === 0} onClick={() => run(() => props.update({ extraSeats: current.extraSeats - 1 }), "Seats updated.")} className={buttonClass("secondary", "sm")}>
                −
              </button>
              <span className="w-16 text-center font-semibold tabular-nums">{current.extraSeats}</span>
              <button type="button" aria-label="One more seat" disabled={pending} onClick={() => run(() => props.update({ extraSeats: current.extraSeats + 1 }), "Seats updated.")} className={buttonClass("secondary", "sm")}>
                +
              </button>
            </div>
          )}
        </section>
      )}

      {view.next && current && (
        <section aria-labelledby="next-invoice" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
          <h2 id="next-invoice" className="font-semibold">
            Next invoice · {dateText(current.currentPeriodEnd)}
          </h2>
          <QuoteTable q={view.next} />
          <p className="text-xs text-muted">At today’s spaces and seats. Archiving a space before then lowers it.</p>
        </section>
      )}

      <DetailsForm view={view} isOwner={props.isOwner} save={props.saveDetails} />

      <section aria-labelledby="invoices" className="flex flex-col gap-2">
        <h2 id="invoices" className="text-lg font-semibold">
          Invoices
        </h2>
        {view.invoices.length === 0 ? (
          <p className="text-sm text-muted">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Invoice
                  </th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">
                    Date
                  </th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">
                    Period
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {view.invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/o/${props.org}/settings/billing/invoices/${i.id}`} className="font-semibold hover:underline">
                        {i.number}
                      </Link>
                    </td>
                    <td className="px-2">{dateText(i.issuedAt)}</td>
                    <td className="px-2 text-muted">
                      {dateText(i.periodStart)} – {dateText(i.periodEnd)}
                    </td>
                    <td className="px-2 text-right tabular-nums">{formatMoney(i.total, i.currency)}</td>
                    <td className="px-4 capitalize">{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {checkout && (
        <Checkout
          plan={checkout}
          interval={interval}
          view={view}
          pending={pending}
          onClose={() => setCheckout(null)}
          onPay={(extraSeats, method) => run(() => props.choose({ plan: checkout, interval, extraSeats, method }), `You’re on ${PLANS[checkout].name}. The invoice is below.`, () => setCheckout(null))}
        />
      )}
    </div>
  );
}

function Checkout({ plan, interval, view, pending, onClose, onPay }: { plan: PlanId; interval: Interval; view: BillingView; pending: boolean; onClose: () => void; onPay: (extraSeats: number, method: "card" | "upi") => void }) {
  const included = PLANS[plan].seatsPerSpace * Math.max(1, view.usage.activeSpaces);
  const [extraSeats, setExtraSeats] = useState(Math.max(0, view.usage.seatsUsed - included));
  const [method, setMethod] = useState<"card" | "upi">(view.currency === "INR" ? "upi" : "card");
  const q = quote({ plan, interval, currency: view.currency, spaces: view.usage.activeSpaces, extraSeats, buyerStateCode: view.buyerState });
  const short = view.usage.seatsUsed > included + extraSeats;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <button type="button" aria-label="Close" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`Choose ${PLANS[plan].name}`} className="relative flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 className="font-display text-xl font-bold">
          {PLANS[plan].name}, {interval === "year" ? "yearly" : "monthly"}
        </h2>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Extra seats <span className="text-muted">({included} included; {view.usage.seatsUsed} in use)</span>
          </span>
          <input type="number" min={0} max={500} value={extraSeats} onChange={(e) => setExtraSeats(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} className="h-9 w-20 rounded-lg border border-line px-2 text-right" />
        </label>
        {short && <p className="text-sm text-danger">You need at least {view.usage.seatsUsed - included} extra seats for the people already here.</p>}
        <QuoteTable q={q} />
        {view.currency === "INR" && !view.details.gstin && <p className="text-xs text-muted">Add your GSTIN under Billing details to get a GST invoice you can claim input credit on.</p>}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Pay with</legend>
          {(view.currency === "INR" ? (["upi", "card"] as const) : (["card"] as const)).map((m) => (
            <label key={m} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              {m === "upi" ? "UPI" : "Card"} <span className="text-muted">· sample, nothing is charged</span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonClass("ghost")}>
            Cancel
          </button>
          <button type="button" disabled={pending || short} onClick={() => onPay(extraSeats, method)} className={buttonClass("primary")}>
            Pay {formatMoney(q.total, q.currency)} (sample)
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsForm({ view, isOwner, save }: { view: BillingView; isOwner: boolean; save: (input: { legalName: string; gstin: string; email: string; address: string; stateCode: string }) => Promise<BillingResult> }) {
  const d = view.details;
  const [values, setValues] = useState({ legalName: d.legalName ?? "", gstin: d.gstin ?? "", email: d.email ?? "", address: d.address ?? "", stateCode: d.stateCode ?? "" });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [k]: e.target.value });
  const field = "h-10 rounded-lg border border-line bg-surface px-3 text-sm font-normal disabled:bg-subtle";
  return (
    <section aria-labelledby="billing-details" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <h2 id="billing-details" className="font-semibold">
        Billing details
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await save(values);
            setMsg(r.ok ? { text: "Saved. New invoices use these details." } : { text: r.error, error: true });
          });
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Legal name
          <input disabled={!isOwner} value={values.legalName} onChange={set("legalName")} maxLength={120} placeholder="As registered" className={field} />
        </label>
        {view.currency === "INR" && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            GSTIN <span className="font-normal text-muted">(optional)</span>
            <input disabled={!isOwner} value={values.gstin} onChange={set("gstin")} maxLength={15} placeholder="07ABCDE1234F1Z5" className={`${field} uppercase`} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Invoice email
          <input disabled={!isOwner} type="email" value={values.email} onChange={set("email")} maxLength={200} placeholder="accounts@yourcompany.in" className={field} />
        </label>
        {view.currency === "INR" && !values.gstin && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            State
            <select disabled={!isOwner} value={values.stateCode} onChange={set("stateCode")} className={field}>
              <option value="">Choose a state</option>
              {GST_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
          Address
          <textarea disabled={!isOwner} value={values.address} onChange={set("address")} maxLength={300} rows={2} className="rounded-lg border border-line px-3 py-2 text-sm font-normal disabled:bg-subtle" />
        </label>
        {isOwner && (
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
              Save details
            </button>
            <span aria-live="polite" className={`text-sm ${msg?.error ? "text-danger" : "text-muted"}`}>
              {msg?.text}
            </span>
          </div>
        )}
      </form>
    </section>
  );
}
