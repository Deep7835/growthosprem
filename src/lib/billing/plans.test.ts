import { describe, expect, it } from "vitest";
import { formatMoney, gstState, isGstin, limitsFor, periodEnd, phaseOf, quote } from "./plans";

describe("pricing", () => {
  it("charges per active space plus extra seats, with GST inside the seller's state split in two", () => {
    const q = quote({ plan: "growth", interval: "month", currency: "INR", spaces: 3, extraSeats: 2, buyerStateCode: "07" });
    expect(q.lines.map((l) => [l.quantity, l.amount])).toEqual([
      [3, 749700],
      [2, 59800],
    ]);
    expect(q.subtotal).toBe(809500);
    expect(q.taxes).toEqual([
      { label: "CGST", rate: 0.09, amount: 72855 },
      { label: "SGST", rate: 0.09, amount: 72855 },
    ]);
    expect(q.total).toBe(955210);
    expect(formatMoney(q.total, "INR")).toBe("₹9,552.10");
  });

  it("uses IGST across states, no tax outside India, and 10 months for a year", () => {
    expect(quote({ plan: "starter", interval: "month", currency: "INR", spaces: 1, extraSeats: 0, buyerStateCode: "27" }).taxes).toEqual([{ label: "IGST", rate: 0.18, amount: 17982 }]);
    const usd = quote({ plan: "starter", interval: "year", currency: "USD", spaces: 0, extraSeats: 0 });
    expect(usd.taxes).toEqual([]);
    expect(usd.total).toBe(15000);
  });

  it("scales limits with spaces", () => {
    expect(limitsFor("starter", 2, 3)).toEqual({ seats: 7, credits: 600, storageBytes: 10 * 1024 ** 3 });
  });

  it("checks GSTINs and reads the state from them", () => {
    expect(isGstin("07aabcu9603r1zm")).toBe(true);
    expect(isGstin("07AABCU9603R1Z")).toBe(false);
    expect(gstState("27AABCU9603R1ZM")).toBe("27");
    expect(gstState("nope")).toBeNull();
  });

  it("ends a month on the same day, or the month's last day", () => {
    expect(periodEnd(new Date("2026-01-31T10:00:00Z"), "month").toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(periodEnd(new Date("2026-10-06T10:00:00Z"), "year").toISOString()).toBe("2027-10-06T10:00:00.000Z");
  });
});

describe("trial and plan phases (OB-10)", () => {
  const now = new Date("2026-10-06T00:00:00Z");
  const later = new Date("2026-11-01T00:00:00Z");
  const earlier = new Date("2026-09-01T00:00:00Z");
  const sub = (o: object) => ({ plan: "starter" as const, status: "active" as const, cancelAtPeriodEnd: false, currentPeriodEnd: later, extraSeats: 0, ...o });
  it("is a Growth-limits trial until it ends, then read-only", () => {
    expect(phaseOf(null, later, now)).toEqual({ phase: "trial", plan: "growth", locked: false });
    expect(phaseOf(null, earlier, now)).toEqual({ phase: "expired", plan: "growth", locked: true });
  });
  it("follows the subscription, with a week's grace when a renewal fails", () => {
    expect(phaseOf(sub({}), earlier, now).phase).toBe("active");
    expect(phaseOf(sub({ cancelAtPeriodEnd: true }), earlier, now).phase).toBe("canceling");
    expect(phaseOf(sub({ status: "past_due", currentPeriodEnd: new Date("2026-10-03T00:00:00Z") }), earlier, now)).toMatchObject({ phase: "past_due", locked: false });
    expect(phaseOf(sub({ status: "canceled" }), earlier, now)).toMatchObject({ phase: "expired", plan: "starter", locked: true });
  });
});
