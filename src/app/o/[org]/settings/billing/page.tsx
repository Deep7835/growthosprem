import { BillingClient } from "@/components/billing/BillingClient";
import { loadBilling } from "@/server/billing";
import { getOrgContext } from "@/server/tenancy";
import { cancelPlan, choosePlan, saveBillingDetails, updatePlan } from "./actions";

export const metadata = { title: "Billing" };

/** Settings › Billing (PRD 6.20). The Owner manages it; Admins can see it. */
export default async function BillingPage({ params }: PageProps<"/o/[org]/settings/billing">) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return <p className="mx-auto max-w-4xl p-6 text-sm text-muted">Only the Owner can see billing.</p>;
  }
  const view = await loadBilling(ctx);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 pb-14">
      <BillingClient
        org={org}
        isOwner={ctx.role === "owner"}
        view={view}
        choose={choosePlan.bind(null, org)}
        update={updatePlan.bind(null, org)}
        cancel={cancelPlan.bind(null, org)}
        saveDetails={saveBillingDetails.bind(null, org)}
      />
    </div>
  );
}
