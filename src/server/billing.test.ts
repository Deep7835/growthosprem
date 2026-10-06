import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/core";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { renewDue } from "@/billing/core";
import { changePlan, checkSeats, loadBilling, saveDetails, setCancel, subscribe } from "./billing";
import type { OrgContext } from "./tenancy";

let db: Db;
let owner: OrgContext;

const fresh = async (): Promise<OrgContext> => {
  const [org] = await db.select().from(s.organizations);
  return { ...owner, org, billing: { phase: "trial", plan: "growth", locked: false }, requestTime: Date.now() } as OrgContext;
};

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  (globalThis as unknown as { __growthDb?: Promise<Db> }).__growthDb = Promise.resolve(db);
  const [org] = await db.select().from(s.organizations);
  const [user] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
  owner = { org, user, role: "owner", requestTime: Date.now(), billing: { phase: "trial", plan: "growth", locked: false } } as unknown as OrgContext;
}, 60_000);

describe("billing (PRD 6.20)", () => {
  it("counts seats as members plus pending invites, and refuses invites over the limit (TM-04)", async () => {
    const view = await loadBilling(await fresh());
    expect(view.usage).toMatchObject({ activeSpaces: 2, members: 3 });
    expect(view.limits.seats).toBe(10); // Growth trial: 5 per space
    await expect(checkSeats({ ...(await fresh()), billing: { phase: "active", plan: "starter", locked: false } } as OrgContext, 2)).rejects.toThrow(/Only 1 of 4 seats/);
  });

  it("only the Owner changes billing; GSTINs are checked", async () => {
    const admin = { ...(await fresh()), role: "admin" } as OrgContext;
    await expect(subscribe(admin, { plan: "growth", interval: "month", extraSeats: 0, method: "upi" })).rejects.toThrow(/Only the Owner/);
    await expect(saveDetails(await fresh(), { legalName: "KnockKnockClub Pvt Ltd", gstin: "07ABC", email: "", address: "", stateCode: "" })).rejects.toThrow(/GSTIN/);
    await saveDetails(await fresh(), { legalName: "KnockKnockClub Pvt Ltd", gstin: "07aabcu9603r1zm", email: "accounts@kkc.in", address: "Hauz Khas, New Delhi", stateCode: "" });
    const [org] = await db.select().from(s.organizations);
    expect(org.billingDetails).toMatchObject({ gstin: "07AABCU9603R1ZM", stateCode: "07" });
  });

  it("subscribes in sample mode: a paid GST invoice and the plan's AI credits", async () => {
    const { invoice } = await subscribe(await fresh(), { plan: "growth", interval: "month", extraSeats: 1, method: "upi" });
    expect(invoice).toMatchObject({ number: `PLT-${new Date().getUTCFullYear()}-0001`, status: "paid", currency: "INR", subtotal: 2 * 249900 + 29900 });
    expect(invoice.taxes.map((t) => t.label)).toEqual(["CGST", "SGST"]);
    expect(invoice.billedTo.legalName).toBe("KnockKnockClub Pvt Ltd");
    const [org] = await db.select().from(s.organizations);
    expect(org.aiMonthlyCredits).toBe(2000);
    await expect(subscribe(await fresh(), { plan: "starter", interval: "month", extraSeats: 0, method: "card" })).rejects.toThrow(/already a plan/);
  });

  it("changes plan and seats, refusing fewer seats than people", async () => {
    // Two pending invites count as seats too: 5 in use, Starter on 2 spaces allows 4.
    const [prem] = await db.select().from(s.users).where(eq(s.users.email, "prem@example.com"));
    await db.insert(s.invites).values(
      ["a@kkc.in", "b@kkc.in"].map((email) => ({ orgId: owner.org.id, email, role: "editor" as const, spaceIds: [], tokenHash: email, invitedBy: prem.id, expiresAt: new Date(Date.now() + 7 * 864e5) })),
    );
    await expect(changePlan(await fresh(), { plan: "starter", extraSeats: 0 })).rejects.toThrow(/5 are in use/);
    await changePlan(await fresh(), { plan: "agency", extraSeats: 0 });
    const [sub] = await db.select().from(s.subscriptions);
    expect(sub).toMatchObject({ plan: "agency", extraSeats: 0 });
  });

  it("renews at the end of the period, and ends a cancelled plan instead", async () => {
    const [sub] = await db.select().from(s.subscriptions);
    const after = new Date(sub.currentPeriodEnd.getTime() + 1000);
    expect(await renewDue(db, after)).toBe(1);
    const invoices = await db.select().from(s.invoices);
    expect(invoices).toHaveLength(2);
    expect(invoices.find((i) => i.number.endsWith("0002"))?.lines[0].label).toContain("Agency");
    await setCancel(await fresh(), true);
    const [renewed] = await db.select().from(s.subscriptions);
    await renewDue(db, new Date(renewed.currentPeriodEnd.getTime() + 1000));
    const [ended] = await db.select().from(s.subscriptions);
    expect(ended.status).toBe("canceled");
  });
});
