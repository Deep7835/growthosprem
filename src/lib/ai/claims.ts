// Source labels on Copilot answers (AI-07). The model ends each factual claim with
// [Your data] and each recommendation with [AI suggestion]. Every number in a
// [Your data] claim must also appear in a tool result (the computed facts), or the
// claim is shown as "Check this" instead: the model explains numbers, it never makes them.

export type ClaimLabel = "data" | "ai" | "unverified";
export interface Segment {
  text: string;
  label?: ClaimLabel;
}

const TAG = /\s*\[(Your data|AI suggestion)\]/g;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const toNumbers = (text: string) => (text.match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, ""))).filter((n) => Number.isFinite(n));

/** Every number found in the tool results, plus fractions as percentages (0.072 → 7.2). */
export function knownNumbers(toolResults: string[]): number[] {
  const out = new Set<number>();
  for (const r of toolResults) {
    for (const n of toNumbers(r)) out.add(n);
    for (const m of r.match(/\b0\.\d+/g) ?? []) out.add(Number(m) * 100);
  }
  return [...out];
}

/** A stated number matches a known one when it is that number, rounded to 0–2 decimals. */
function supported(n: number, known: number[]): boolean {
  return known.some((k) => [0, 1, 2].some((d) => Math.abs(Number(k.toFixed(d)) - n) < 1e-9) || Math.abs(k - n) < 1e-9);
}

export function labelClaims(text: string, toolResults: string[]): Segment[] {
  const known = knownNumbers(toolResults);
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG)) {
    const claim = text.slice(last, match.index);
    let label: ClaimLabel = match[1] === "Your data" ? "data" : "ai";
    if (label === "data" && !toNumbers(claim).every((n) => supported(n, known))) label = "unverified";
    segments.push({ text: claim, label });
    last = match.index! + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
