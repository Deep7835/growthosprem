import { FitBox } from "./FitBox";

const COLUMNS = [
  { name: "Idea", color: "#9CA3AF", cards: [["Customer reactions", "IG Reel"], ["Monsoon menu teaser", "IG Reel"]] },
  { name: "Client review", color: "#F472B6", cards: [["5 Diwali sweets to try", "IG Carousel"], ["Teaser: something sweet", "IG Reel"]] },
  { name: "Approved", color: "#34D399", cards: [["Weekend brunch", "IG Story"]] },
  { name: "Scheduled", color: "#fb923c", cards: [["Diwali offer: 20% off", "IG + FB Post"], ["Behind the scenes", "IG + FB Reel"]] },
];

/** The hero's product scene (560 × 340): a board, a post opened for client review, approved, and a toast. */
export function HeroApp() {
  return (
    <div className="lx-glass mx-auto w-full max-w-[640px] rounded-[30px] p-2.5" role="img" aria-label="A client opens a post from the board, approves it, and the team gets a notification (illustration)">
      <div className="flex items-center justify-between px-3 pb-2 pt-1 text-[12px] font-medium text-black/55">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#f97316]" /> Plotline
        </span>
        <span>Thu 9:41</span>
      </div>
      <FitBox width={560} height={340} className="overflow-hidden rounded-[22px]">
        <div className="relative h-[340px] w-[560px] overflow-hidden rounded-[22px] bg-white text-[#0a0a0a]">
          {/* Window chrome */}
          <div className="flex h-[30px] items-center gap-1.5 border-b border-black/5 bg-[#f6f7f9] px-3">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 rounded-md bg-white px-2.5 py-0.5 text-[10px] text-black/50 ring-1 ring-black/5">Cafe › Board</span>
          </div>
          {/* Board */}
          <div className="absolute left-[14px] right-[14px] top-[40px] grid grid-cols-4 gap-2">
            {COLUMNS.map((col) => (
              <div key={col.name} className="flex flex-col gap-2 rounded-xl bg-[#f3f4f6] p-1.5">
                <span className="flex items-center gap-1.5 px-1 pt-0.5 text-[10px] font-semibold">
                  <span className="size-1.5 rounded-full" style={{ background: col.color }} />
                  {col.name}
                </span>
                {col.cards.map(([title, kind], i) => (
                  <div key={title} className={`rounded-lg bg-white p-2 shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] ring-1 ring-black/5 ${col.name === "Client review" && i === 0 ? "lx-card-hi" : ""}`}>
                    <p className="truncate text-[10px] font-semibold leading-tight">{title}</p>
                    <p className="mt-0.5 text-[9px] text-black/45">{kind}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* The post, opened for review */}
          <div className="lx-sheet absolute bottom-[12px] right-[14px] top-[40px] w-[296px] rounded-2xl bg-white p-3 shadow-[0_20px_50px_-12px_rgb(0_0_0_/_0.35)] ring-1 ring-black/5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-black/40">Client review</p>
            <p className="text-[13px] font-semibold">5 Diwali sweets to try</p>
            <div className="mt-2 grid h-[120px] place-items-center rounded-xl bg-gradient-to-br from-[#ffb86b] via-[#ff7a59] to-[#c2410c] text-center font-semibold text-white">
              <span>
                <span className="block text-[20px] leading-none">5 sweets</span>
                <span className="text-[10px] opacity-90">for your Diwali list · 1/5</span>
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-black/60">From kaju katli to our coffee barfi, five sweets our team cannot stop eating. Save this for your list.</p>
            <div className="absolute bottom-3 left-3 flex gap-2">
              <span className="lx-approve inline-flex h-7 items-center rounded-full bg-black px-3.5 text-[11px] font-semibold text-white">Approve</span>
              <span className="inline-flex h-7 items-center rounded-full bg-[#f3f4f6] px-3.5 text-[11px] font-semibold">Ask for changes</span>
            </div>
          </div>
          {/* Toast */}
          <div className="lx-toast absolute left-1/2 top-[38px] flex items-center gap-2 rounded-full bg-[#12141c] py-1.5 pl-1.5 pr-4 text-white shadow-xl">
            <span className="grid size-6 place-items-center rounded-full bg-[#f97316] text-[12px]">✓</span>
            <span className="text-[11px] leading-tight">
              <b className="block">Approved by Anjali</b>
              <span className="text-white/60">Moved to Approved · ready to schedule</span>
            </span>
          </div>
          {/* Cursor */}
          <svg className="lx-cursor absolute left-0 top-0" width="22" height="22" viewBox="0 0 24 24" aria-hidden style={{ transform: "translate(330px, 168px)" }}>
            <path d="M4 2 L4 19 L8.5 14.8 L11.5 21.5 L14.2 20.3 L11.3 13.8 L17.5 13.8 Z" fill="#0a0a0a" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
      </FitBox>
    </div>
  );
}
