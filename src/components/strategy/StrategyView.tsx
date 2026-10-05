import { PLATFORM_COLOR } from "@/lib/analytics/colors";
import { PLACEMENTS, PLATFORM_NAMES } from "@/lib/placements";
import type { StrategyDoc } from "@/lib/strategy";

// Categorical slots from the validated chart palette, in a fixed order for pillars.
const PILLAR_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

const List = ({ items }: { items: string[] }) =>
  items.length ? (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] text-ink-2">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted">Nothing here yet.</p>
  );

/** The strategy document (SG-02), read-only: in the app and on the shared link. */
export function StrategyView({ doc }: { doc: StrategyDoc }) {
  const platforms = [...new Set(doc.cadence.map((c) => c.platform))];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Positioning">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{doc.positioning}</p>
        </Section>
        <Section title="Audience">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{doc.audience}</p>
        </Section>
      </div>

      <Section title="Goals">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 pr-4">Goal</th>
                <th className="py-2 pr-4">Metric</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {doc.goals.map((g, i) => (
                <tr key={i} className="border-t border-line-soft">
                  <td className="py-2 pr-4 font-semibold">{g.goal}</td>
                  <td className="py-2 pr-4">{g.metric}</td>
                  <td className="py-2 pr-4">{g.target}</td>
                  <td className="py-2 text-muted">{g.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Content pillars">
        <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={doc.pillars.map((p) => `${p.name} ${p.share}%`).join(", ")}>
          {doc.pillars.map((p, i) => (
            <span key={p.name} style={{ width: `${p.share}%`, background: PILLAR_COLORS[i % PILLAR_COLORS.length] }} className="border-r-2 border-surface last:border-r-0" />
          ))}
        </div>
        <ul className="grid gap-3 md:grid-cols-2">
          {doc.pillars.map((p, i) => (
            <li key={p.name} className="flex flex-col gap-1 rounded-xl border border-line-soft p-3">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: PILLAR_COLORS[i % PILLAR_COLORS.length] }} />
                <strong>{p.name}</strong>
                <span className="ml-auto text-sm font-semibold text-ink-2">{p.share}%</span>
              </span>
              {p.description && <span className="text-sm text-ink-2">{p.description}</span>}
              {p.examples.length > 0 && <span className="text-[13px] text-muted">e.g. {p.examples.join(" · ")}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Formats and frequency">
        <div className="grid gap-3 md:grid-cols-3">
          {platforms.map((pl) => (
            <div key={pl} className="flex flex-col gap-1.5 rounded-xl border border-line-soft p-3">
              <span className="flex items-center gap-2 font-semibold">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: PLATFORM_COLOR[pl] }} />
                {PLATFORM_NAMES[pl]}
                <span className="ml-auto text-sm font-normal text-muted">{doc.cadence.filter((c) => c.platform === pl).reduce((a, c) => a + c.perWeek, 0)} a week</span>
              </span>
              {doc.cadence
                .filter((c) => c.platform === pl)
                .map((c) => (
                  <span key={c.format} className="flex justify-between text-sm text-ink-2">
                    {PLACEMENTS[c.format].label.replace(`${PLATFORM_NAMES[pl]} `, "")}
                    <span>{c.perWeek}× / week</span>
                  </span>
                ))}
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Themes">
          <List items={doc.themes} />
        </Section>
        <Section title="Growth tactics">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["reach", "engagement", "community", "conversion"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">{k}</span>
                <List items={doc.tactics[k]} />
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="30 / 60 / 90-day plan">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["days30", "First 30 days"],
              ["days60", "By day 60"],
              ["days90", "By day 90"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
              <List items={doc.plan[k]} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
