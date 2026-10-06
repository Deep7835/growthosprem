"use client";

import Link from "next/link";
import { useState } from "react";
import { DRAFT_PRICES, EXTRA_SEAT, MONTHS_PER_YEAR_BILLED, PLAN_IDS, PLANS, type Currency, type Interval, type PlanId } from "@/lib/billing/plans";

const money = (n: number, c: Currency) => new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

function Segmented<T extends string>({ label, value, options, onChange, dark = false }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; dark?: boolean }) {
  return (
    <div role="group" aria-label={label} className={`flex rounded-full p-1 ${dark ? "bg-black/[0.06]" : "bg-white/60 ring-1 ring-black/5"}`}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${value === v ? "bg-[#12141c] text-white shadow" : "text-black/55 hover:text-black"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** One glass card: pick a plan, period and currency. Reads src/lib/billing/plans.ts, so it always matches Billing. */
export function Pricing() {
  const [plan, setPlan] = useState<PlanId>("growth");
  const [interval, setInterval] = useState<Interval>("month");
  const [currency, setCurrency] = useState<Currency>("INR");
  const p = PLANS[plan];
  const amount = p.perSpace[currency] * (interval === "year" ? MONTHS_PER_YEAR_BILLED : 1);
  const points = [
    `${p.seatsPerSpace} team seats per client space`,
    `${p.creditsPerSpace.toLocaleString("en-IN")} AI credits per space a month`,
    `${p.storageGbPerSpace} GB of media per space`,
    "Every view, client review links and publishing",
    "14-day free trial, no card needed",
  ];

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="rounded-[32px] bg-white/75 p-3 shadow-[0_40px_90px_-35px_rgb(194_85_20_/_0.45)] ring-1 ring-white">
        <div className="rounded-[26px] bg-white p-6 sm:p-8">
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#12141c] px-3 py-1.5 text-[13px] font-medium text-white">
              <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-[#ffb15c] to-[#ea580c] text-[10px] font-bold">P</span>
              Plotline for your clients
            </span>
          </div>
          <div className="mt-6">
            <Segmented label="Plan" value={plan} onChange={setPlan} dark options={PLAN_IDS.map((id) => [id, PLANS[id].name])} />
          </div>
          <p className="mt-3 text-center text-sm text-black/50">{p.blurb}</p>
          <p className="mt-6 text-center">
            <span key={`${plan}${interval}${currency}`} className="lx-pop inline-block text-[64px] font-bold leading-none tracking-[-0.05em]">
              {money(amount, currency)}
            </span>
            <span className="mt-2 block text-sm text-black/50">
              per client space a {interval === "year" ? "year" : "month"}
              {currency === "INR" ? " + GST" : ""}
            </span>
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Segmented label="Billing period" value={interval} onChange={setInterval} dark options={[["month", "Monthly"], ["year", "Yearly · 2 free"]]} />
            <Segmented label="Currency" value={currency} onChange={setCurrency} dark options={[["INR", "₹"], ["USD", "$"]]} />
          </div>
          <ul className="mt-6 flex flex-col gap-2.5 text-[15px]">
            {points.map((x) => (
              <li key={x} className="flex items-center gap-2.5">
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-black/[0.06] text-[11px]">
                  ✓
                </span>
                {x}
              </li>
            ))}
          </ul>
          <Link href="/sign-up" className="mt-7 flex h-14 items-center justify-center rounded-full bg-[#0a0a0a] text-[17px] font-semibold text-white transition-transform hover:scale-[1.02]">
            Start free · {p.name}
          </Link>
          <p className="mt-4 text-center text-xs text-black/45">
            Extra seats {money(EXTRA_SEAT[currency], currency)} a month. Archived spaces aren’t billed. UPI or card{currency === "INR" ? ", GST invoices" : ""}.
            {DRAFT_PRICES && " Prices are provisional until launch."}
          </p>
        </div>
      </div>
    </div>
  );
}
