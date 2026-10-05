import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/billing/PrintButton";
import { formatMoney, SELLER } from "@/lib/billing/plans";
import { stateName } from "@/lib/billing/states";
import { getInvoice } from "@/server/billing";
import { getOrgContext } from "@/server/tenancy";

export const metadata = { title: "Invoice" };

const dateText = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(d);

/** A tax invoice (GST in India), printable to PDF. */
export default async function InvoicePage({ params }: PageProps<"/o/[org]/settings/billing/invoices/[id]">) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (ctx.role !== "owner" && ctx.role !== "admin") notFound();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const inv = await getInvoice(ctx, id);
  if (!inv) notFound();
  const gst = inv.currency === "INR";
  const buyerState = inv.billedTo.gstin ? stateName(inv.billedTo.gstin.slice(0, 2)) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6 pb-14 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/o/${org}/settings/billing`} className="text-sm font-semibold text-muted hover:text-ink">
          ← Billing
        </Link>
        <PrintButton />
      </div>
      <article className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-8 print:border-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">{gst ? "Tax invoice" : "Invoice"}</h1>
            <p className="text-sm text-muted">
              {inv.number} · {dateText(inv.issuedAt)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${inv.status === "paid" ? "bg-success-bg text-success-ink" : "bg-warn-bg text-warn-ink"}`}>{inv.status}</span>
        </header>
        <div className="grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">From</p>
            <p className="font-semibold">{SELLER.name}</p>
            <p className="text-muted">{SELLER.address}</p>
            {gst && <p className="text-muted">GSTIN: {SELLER.gstin ?? "to be added once registered"}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Billed to</p>
            <p className="font-semibold">{inv.billedTo.legalName ?? inv.billedTo.name}</p>
            {inv.billedTo.address && <p className="whitespace-pre-line text-muted">{inv.billedTo.address}</p>}
            {inv.billedTo.gstin && (
              <p className="text-muted">
                GSTIN: {inv.billedTo.gstin}
                {buyerState ? ` · ${buyerState}` : ""}
              </p>
            )}
            {inv.billedTo.email && <p className="text-muted">{inv.billedTo.email}</p>}
          </div>
        </div>
        <p className="text-sm text-muted">
          Service period {dateText(inv.periodStart)} to {dateText(inv.periodEnd)}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="py-2 font-semibold">
                Description
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Qty
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Rate
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {inv.lines.map((l) => (
              <tr key={l.label}>
                <td className="py-2">{l.label}</td>
                <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(l.unit, inv.currency)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(l.amount, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-muted">
                Taxable value
              </td>
              <td className="pt-3 text-right tabular-nums">{formatMoney(inv.subtotal, inv.currency)}</td>
            </tr>
            {inv.taxes.map((t) => (
              <tr key={t.label}>
                <td colSpan={3} className="text-right text-muted">
                  {t.label} @ {Math.round(t.rate * 1000) / 10}%
                </td>
                <td className="text-right tabular-nums">{formatMoney(t.amount, inv.currency)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={3} className="pt-2 text-right">
                Total
              </td>
              <td className="pt-2 text-right tabular-nums">{formatMoney(inv.total, inv.currency)}</td>
            </tr>
          </tfoot>
        </table>
        {inv.paidAt && <p className="text-sm text-muted">Paid on {dateText(inv.paidAt)} (sample payment).</p>}
      </article>
    </div>
  );
}
