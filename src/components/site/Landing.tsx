import { Inter, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { Faq } from "./Faq";
import { HeroApp } from "./HeroApp";
import { MotionLayer } from "./MotionLayer";
import { Logo, Nav } from "./Nav";
import { Pricing } from "./Pricing";
import { Reveal, Words } from "./Reveal";
import { Scenarios } from "./Scenarios";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["italic"], variable: "--font-serif", display: "swap" });

/* ---------- Building blocks ---------- */

/** Two-line headline: bold sans, then an italic serif line; the words slide up in turn. */
function Title({ top, bottom, as: Tag = "h2", light = false, size = "md" }: { top: string; bottom: string; as?: "h1" | "h2"; light?: boolean; size?: "md" | "xl" }) {
  const cls = size === "xl" ? "text-[clamp(2.9rem,8vw,5.6rem)]" : "text-[clamp(2.3rem,5.6vw,4rem)]";
  const n = top.split(" ").length;
  return (
    <Tag className={`lx-head ${cls} ${light ? "text-white" : ""}`}>
      <Words text={top} />
      <br />
      <span className="lx-serif text-[1.04em]">
        <Words text={bottom} from={n} />
      </span>
    </Tag>
  );
}

function Head({ top, bottom, body }: { top: string; bottom: string; body?: string }) {
  return (
    <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
      <Title top={top} bottom={bottom} />
      {body && <p className="text-[18px] leading-relaxed text-black/55 sm:text-[20px]">{body}</p>}
    </Reveal>
  );
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const I = {
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  board: "M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  check: "M20 6 9 17l-5-5",
  send: "m22 2-7 20-4-9-9-4zM22 2 11 13",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z",
  flag: "M4 22V4M4 4h12l-2 4 2 4H4",
  tasks: "M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  note: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z",
  image: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM21 15l-5-5L5 21",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  lang: "M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-3 7-6 8M13 21l4-9 4 9M14.5 18h5",
  rupee: "M6 4h12M6 9h12M9 4c6 0 6 10 0 10H6l8 7",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  key: "M15 7a4 4 0 1 1-3.8 5.3L4 19.5V22h3v-2h2v-2h2l1.2-1.2A4 4 0 0 1 15 7z",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  repeat: "M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
};

const CHIPS: [keyof typeof I, string][] = [
  ["board", "Board"],
  ["table", "Table"],
  ["calendar", "Calendar"],
  ["eye", "Platform previews"],
  ["check", "Client review links"],
  ["send", "Autopost"],
  ["bell", "Post-by-hand reminders"],
  ["repeat", "Automatic retries"],
  ["lang", "Hinglish and Hindi"],
  ["spark", "AI Copilot"],
  ["note", "Brand Brain"],
  ["compass", "Strategy wizard"],
  ["calendar", "Plan 30 days"],
  ["flag", "Festival calendar"],
  ["bulb", "Idea Bank"],
  ["tasks", "Tasks and templates"],
  ["board", "Projects"],
  ["note", "Notes with @mentions"],
  ["image", "Media library"],
  ["chart", "Analytics"],
  ["chart", "First audit"],
  ["spark", "AI tags: topic and hook"],
  ["search", "⌘K search"],
  ["bell", "Email digest and push"],
  ["users", "Roles per client"],
  ["rupee", "GST invoices and UPI"],
];

const MARQUEE = [
  ["Instagram Reels", "Carousels", "Stories", "Facebook Posts", "Facebook Reels", "Client review links", "Autopost", "Hinglish captions", "Hindi captions", "GST invoices", "UPI"],
  ["Diwali", "Navratri", "Dhanteras", "Holi", "Raksha Bandhan", "Eid", "Independence Day", "Ganesh Chaturthi", "Onam", "Christmas", "New Year"],
];

function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  return (
    <div className="lx-marquee-wrap overflow-hidden">
      <div className={`lx-marquee flex w-max gap-3 ${reverse ? "is-rev" : ""}`}>
        {[...items, ...items].map((x, i) => (
          <span key={i} aria-hidden={i >= items.length || undefined} className="flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-[15px] font-medium text-black/70 shadow-[0_1px_2px_rgb(0_0_0_/_0.05)] ring-1 ring-black/5">
            <span className="size-1.5 rounded-full bg-[#f97316]" />
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

const STEPS: { n: string; title: string; body: string; art: React.ReactNode }[] = [
  {
    n: "01",
    title: "Connect your accounts",
    body: "Instagram and Facebook through Meta’s official login. The last 90 days come in on their own.",
    art: (
      <div className="flex w-[78%] flex-col gap-2">
        {[
          ["IG", "@cafe.delhi", "from-[#f58529] via-[#dd2a7b] to-[#8134af]"],
          ["FB", "Cafe Delhi", "from-[#4f8cff] to-[#1f3fd1]"],
        ].map(([b, h, g]) => (
          <div key={h} className="lx-pop flex items-center gap-2.5 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/5" style={{ animationDelay: `${200 + (b === "FB" ? 160 : 0)}ms` }}>
            <span className={`grid size-8 place-items-center rounded-xl bg-gradient-to-br ${g} text-[11px] font-bold text-white`}>{b}</span>
            <span className="flex-1 text-[13px] font-semibold">{h}</span>
            <span className="lx-pop-in rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-semibold text-[#166534]" style={{ animationDelay: `${700 + (b === "FB" ? 160 : 0)}ms` }}>
              Connected
            </span>
          </div>
        ))}
        <div className="h-1.5 overflow-hidden rounded-full bg-black/5">
          <div className="lx-grow-x h-full w-[70%] rounded-full bg-[#f97316]" style={{ animationDelay: "900ms", animationDuration: "1.6s" }} />
        </div>
      </div>
    ),
  },
  {
    n: "02",
    title: "Plan the month",
    body: "A strategy from Brand Brain and your results, then 30 days of posts with festivals in place.",
    art: (
      <div className="grid w-[78%] grid-cols-7 gap-1.5">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className={`lx-pop-in aspect-square rounded-md ${[2, 5, 9, 12, 16, 19, 23, 26].includes(i) ? "bg-[#fb923c]" : i === 20 ? "bg-[#c2410c]" : "bg-white ring-1 ring-black/5"}`}
            style={{ animationDelay: `${150 + (i % 7) * 40 + Math.floor(i / 7) * 90}ms` }}
          />
        ))}
      </div>
    ),
  },
  {
    n: "03",
    title: "Get it approved",
    body: "Send one link. Your client approves or asks for changes on their phone, no account needed.",
    art: (
      <div className="flex flex-col items-center gap-2.5">
        <span className="relative">
          <span aria-hidden className="lx-ping absolute inset-0 rounded-full bg-[#f97316]" />
          <span className="relative block rounded-full bg-[#0a0a0a] px-6 py-2.5 text-sm font-semibold text-white shadow-lg">Approve</span>
        </span>
        <span className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-black/5">Ask for changes</span>
      </div>
    ),
  },
  {
    n: "04",
    title: "Publish and learn",
    body: "Autopost at the right time, then see what worked by format, pillar, topic and hook.",
    art: (
      <svg viewBox="0 0 200 90" className="w-[80%]" aria-hidden>
        <defs>
          <linearGradient id="step-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f97316" stopOpacity="0.3" />
            <stop offset="1" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 72 L28 66 L56 68 L84 52 L112 56 L140 36 L168 40 L200 16 L200 90 L0 90 Z" fill="url(#step-area)" />
        <path d="M0 72 L28 66 L56 68 L84 52 L112 56 L140 36 L168 40 L200 16" fill="none" stroke="#ea580c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lx-line" />
        <circle cx="200" cy="16" r="5" fill="#ea580c" className="lx-pop-in" style={{ animationDelay: "1.9s", transformOrigin: "200px 16px" }} />
      </svg>
    ),
  },
];

const FAQ: [string, string][] = [
  ["What does it cost?", "A price per active client space each month, with team seats included in each space. Archived spaces aren’t billed, and every plan starts with a 14-day free trial."],
  ["Which platforms can I publish to?", "Instagram (posts, Reels, Stories and carousels) and Facebook Pages (posts, Reels and Stories), through Meta’s official API. LinkedIn is next. You can still plan anything and mark it as posted by hand."],
  ["Do clients need an account to approve?", "No. They open your review link, add their name, see real previews and approve or ask for changes. They never see internal comments, tasks or your other clients."],
  ["How does the AI know about my clients?", "It reads your own data, only for spaces you can see: posts, results, calendar, Brand Brain and ideas. Each claim says whether it’s from your data, AI judgement or the web, and anything it changes waits for your approval."],
  ["Can it write in Hindi or Hinglish?", "Yes. Write, improve, shorten or translate captions into Hindi or Hinglish, per platform if you like. Brand Brain remembers each client’s language and voice."],
  ["Do you send GST invoices?", "Yes. Add your GSTIN and every invoice shows CGST and SGST or IGST. Pay by UPI or card."],
  ["What happens when the trial ends?", "Pick a plan to carry on. If you don’t, everything stays readable but nothing can be changed or published until you do."],
];

/* ---------- The page ---------- */

export function Landing() {
  return (
    <div className={`lx ${inter.variable} ${serif.variable} overflow-x-clip antialiased`}>
      <MotionLayer />
      <Nav />

      {/* Hero */}
      <section data-live className="lx-sky relative isolate overflow-hidden px-4 pb-24 pt-32 sm:pt-40">
        {/* Slow light: soft radial orbs drifting behind everything (transform only). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span className="lx-orb lx-drift-a -left-40 -top-40 size-[640px] bg-[radial-gradient(circle,rgb(255_255_255_/_0.7),transparent_62%)]" />
          <span className="lx-orb lx-drift-b -right-48 top-24 size-[560px] bg-[radial-gradient(circle,rgb(234_88_12_/_0.32),transparent_62%)]" />
          <span className="lx-orb lx-drift-a left-1/3 top-[46%] size-[520px] bg-[radial-gradient(circle,rgb(255_220_180_/_0.8),transparent_62%)]" style={{ animationDelay: "-7s" }} />
        </div>
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center text-[#1c1206]">
          <span className="lx-pop flex items-center gap-2 text-[17px] font-medium text-[#9a3d06]">
            <Icon d={I.spark} size={18} /> Social media workspace
          </span>
          <div className="lx-rise mt-5">
            <Title as="h1" size="xl" top="Plan every post." bottom="Grow every client." />
          </div>
          <p className="lx-pop mt-7 max-w-xl text-[18px] leading-relaxed text-black/65 sm:text-[21px]" style={{ animationDelay: "420ms" }}>
            Calendars, client approvals, publishing and results for every brand you run. Press <span className="lx-key">⌘K</span> to find anything, ask the AI Copilot for next week, and post to Instagram and Facebook on time.
          </p>
          <div className="lx-pop mt-9" style={{ animationDelay: "520ms" }}>
            <Link href="/sign-up" className="group lx-sheen inline-flex h-14 items-center gap-2.5 rounded-full bg-[#0a0a0a] px-8 text-[17px] font-semibold text-white shadow-[0_20px_40px_-12px_rgb(0_0_0_/_0.5)] transition-transform duration-300 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-[0.98]">
              Start free · 14 days
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
          <p className="lx-pop mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[14px] font-medium text-black/55" style={{ animationDelay: "600ms" }}>
            <span>No card needed</span>
            <span>Hinglish and Hindi</span>
            <span>GST invoices</span>
            <span>Instagram and Facebook</span>
          </p>
        </div>
        <div className="lx-pop relative mx-auto mt-16 max-w-[680px]" style={{ animationDelay: "680ms" }}>
          <div className="lx-tilt origin-top">
            <HeroApp />
          </div>
          {/* Sample chips floating beside the app on wide screens */}
          <span aria-hidden className="lx-float absolute -left-24 top-16 hidden items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-[13px] font-semibold shadow-[0_20px_40px_-18px_rgb(194_85_20_/_0.5)] ring-1 ring-black/5 lg:flex">
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-[10px] font-bold text-white">IG</span>
            Reel · Thu 7 PM
          </span>
          <span aria-hidden className="lx-float absolute -right-20 top-44 hidden items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-[13px] font-semibold shadow-[0_20px_40px_-18px_rgb(194_85_20_/_0.5)] ring-1 ring-black/5 lg:flex" style={{ animationDelay: "-2.5s" }}>
            <span className="grid size-7 place-items-center rounded-lg bg-[#fff1d6] text-[#8a5300]">
              <Icon d={I.flag} size={14} />
            </span>
            Diwali plan ready
          </span>
          <span aria-hidden className="lx-float absolute -left-14 bottom-10 hidden items-center gap-2 rounded-2xl bg-[#12141c] px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_20px_40px_-18px_rgb(0_0_0_/_0.5)] lg:flex" style={{ animationDelay: "-4s" }}>
            <span className="text-[#fdba74]">
              <Icon d={I.spark} size={14} />
            </span>
            Hinglish caption
          </span>
        </div>
      </section>

      {/* What it plans for: formats and festivals, gliding past */}
      <section data-live aria-label="Formats and festivals Plotline plans for" className="flex flex-col gap-3 bg-gradient-to-b from-white to-[#fff6ee] py-10">
        <Marquee items={MARQUEE[0]} />
        <Marquee items={MARQUEE[1]} reverse />
      </section>

      {/* Moments */}
      <section id="moments" className="scroll-mt-24 px-4 py-24 sm:py-32">
        <Head top="Built for the days" bottom="that make or break a month." body="Festival weeks, approval chases, a post that didn’t go out. Pick one and watch it play out." />
        <Reveal className="mx-auto mt-12 max-w-5xl">
          <Scenarios />
        </Reveal>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 px-4 py-24 sm:py-32">
        <Head top="From the first brief" bottom="to the monthly results." body="Four steps from a new client to a month that runs itself. No spreadsheets, no chasing on WhatsApp." />
        <div className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={(i % 2) * 120}>
              <article data-spot className="group h-full rounded-[30px] bg-[#f6f6f8] p-3">
                <div className="grid h-[220px] place-items-center rounded-[24px] bg-gradient-to-b from-[#fbf6f1] to-[#f4ece4] transition-transform duration-500 group-hover:scale-[0.985]">{s.art}</div>
                <div className="px-4 pb-4 pt-5">
                  <p className="font-mono text-[13px] text-black/35">{s.n}</p>
                  <h3 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{s.title}</h3>
                  <p className="mt-1.5 text-[16px] leading-relaxed text-black/55">{s.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 px-4 py-24 sm:py-32">
        <Head top="Everything your team does," bottom="in one calm place." body="Calendar, approvals, publishing, strategy and analytics, plus the small touches that give your team back an afternoon every week." />
        <Reveal className="lx-stagger mx-auto mt-12 flex max-w-4xl flex-wrap justify-center gap-2.5">
          {CHIPS.map(([icon, label], i) => (
            <span key={label} style={{ "--i": i } as React.CSSProperties}>
              <span className="group inline-flex items-center gap-2 rounded-full bg-[#f2f2f4] px-4 py-2.5 text-[15px] text-black/75 transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_24px_-12px_rgb(194_85_20_/_0.5)] hover:ring-1 hover:ring-[#fed7aa]">
                <span className="text-black/50 transition-colors duration-300 group-hover:text-[#ea580c]">
                  <Icon d={I[icon]} size={16} />
                </span>
                {label}
              </span>
            </span>
          ))}
        </Reveal>
      </section>

      {/* AI Copilot */}
      <section className="px-4 py-24 sm:py-32">
        <Head top="An AI that knows" bottom="your numbers." body="Ask about any client. It reads their results, calendar and Brand Brain, shows its evidence, and proposes work you approve with a tap." />
        <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-[1.25fr_1fr]">
          <Reveal>
            <div className="h-full rounded-[30px] bg-[#0f1117] p-6 text-white sm:p-8">
              <p className="lx-pop ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[15px] text-black" style={{ animationDelay: "250ms" }}>
                Why did Cafe’s reach drop last month?
              </p>
              <div className="lx-pop mt-4 flex flex-col gap-3 rounded-2xl rounded-bl-md bg-white/[0.07] p-4 text-[15px] leading-relaxed text-white/85" style={{ animationDelay: "750ms" }}>
                <p>
                  Reels went from 5 to 2 a week, and Reels reach about twice as many people as posts for Cafe.{" "}
                  <span className="whitespace-nowrap rounded-md bg-[#dbeafe] px-1.5 py-0.5 text-[11px] font-semibold text-[#1e40af]">From your data</span>
                </p>
                <p>
                  Evenings still do best, so move them to 7 PM.{" "}
                  <span className="whitespace-nowrap rounded-md bg-[#f3e8ff] px-1.5 py-0.5 text-[11px] font-semibold text-[#6b21a8]">AI judgement</span>
                </p>
                <div className="lx-pop rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10" style={{ animationDelay: "1300ms" }}>
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-[#fdba74]">Proposed · 4 draft posts</p>
                  <p className="mt-1">3 Reels and a carousel, Wednesday to Saturday at 7 PM</p>
                  <span className="mt-3 flex gap-2">
                    <span className="relative">
                      <span aria-hidden className="lx-ping absolute inset-0 rounded-full bg-[#fdba74]" style={{ animationDelay: "1.8s" }} />
                      <span className="relative block rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-black">Approve</span>
                    </span>
                    <span className="rounded-full px-4 py-1.5 text-[13px] font-semibold ring-1 ring-white/25">Edit first</span>
                  </span>
                </div>
              </div>
              <p className="mt-4 text-center text-[12px] text-white/35">Illustration with sample numbers</p>
            </div>
          </Reveal>
          <div className="flex flex-col gap-5">
            {[
              [I.check, "Shows its evidence", "Every claim is labelled: from your data, AI judgement or the web."],
              [I.shield, "Asks before it acts", "Draft posts, plans and ideas arrive as cards to approve, and Undo is one tap away."],
              [I.lang, "Sounds like each client", "Brand Brain keeps every client’s voice, audience, do’s, don’ts and language."],
            ].map(([icon, t, b], i) => (
              <Reveal key={t} delay={i * 110}>
                <div data-spot className="flex gap-4 rounded-[26px] bg-[#f6f6f8] p-6">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow-sm">
                    <Icon d={icon} />
                  </span>
                  <span>
                    <b className="block text-[17px]">{t}</b>
                    <span className="text-[15px] text-black/55">{b}</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Kept apart */}
      <section className="px-4 py-16 sm:py-24">
        <div className="mx-auto grid max-w-5xl items-center gap-10 rounded-[36px] bg-[#f6f6f8] p-6 sm:p-12 lg:grid-cols-2">
          <div>
            <Reveal>
              <h2 className="lx-head text-[clamp(2.2rem,5vw,3.4rem)]">
                <Words text="Each client," />{" "}
                <span className="lx-serif">
                  <Words text="kept apart." from={2} />
                </span>
              </h2>
              <p className="mt-4 text-[18px] text-black/55">The right people see the right brands, and nobody sees the rest.</p>
            </Reveal>
            <ul className="mt-8 flex flex-col gap-5">
              {[
                [I.users, "Roles that fit agencies", "Owner, Admin, Manager, Editor and client reviewer, each with exactly what they need."],
                [I.key, "Editors can’t publish by accident", "Scheduling is for Managers unless a space allows Editors to."],
                [I.lock, "Tokens locked away", "Instagram and Facebook access is encrypted at rest."],
                [I.shield, "Walls in the database", "Every organisation’s data is isolated at the database level, not just hidden in the app."],
              ].map(([icon, t, b], i) => (
                <Reveal key={t} delay={i * 90} as="li">
                  <span className="flex gap-3.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white shadow-sm">
                      <Icon d={icon} size={16} />
                    </span>
                    <span>
                      <b className="block">{t}</b>
                      <span className="text-[15px] text-black/55">{b}</span>
                    </span>
                  </span>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal delay={150}>
            <div data-live className="lx-sky-up relative grid aspect-square place-items-center overflow-hidden rounded-[30px]" role="img" aria-label="Three client spaces, Cafe, Real estate and Jewellers, each on its own orbit around a shield (illustration)">
              {/* Each client circles on its own ring, never crossing into another's. */}
              {[
                ["inset-[5%]", "Cafe", "46s", "0s", false],
                ["inset-[17%]", "Real estate", "38s", "-14s", true],
                ["inset-[29%]", "Jewellers", "30s", "-8s", false],
              ].map(([inset, name, dur, delay, rev]) => (
                <div key={name as string} aria-hidden className={`absolute ${inset} rounded-full border border-dashed border-white`}>
                  <div className={`lx-spin absolute inset-0 ${rev ? "is-rev" : ""}`} style={{ animationDuration: dur as string, animationDelay: delay as string }}>
                    <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                      <span className={`lx-spin block whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold shadow-md ${rev ? "" : "is-rev"}`} style={{ animationDuration: dur as string, animationDelay: delay as string }}>
                        {name as string}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
              <div className="lx-float relative grid size-24 place-items-center rounded-[28px] bg-white/45 shadow-[0_30px_60px_-20px_rgb(194_85_20_/_0.5)] ring-1 ring-white/80">
                <span aria-hidden className="lx-ping is-even absolute inset-2 rounded-[22px] bg-white" />
                <span className="relative grid size-16 place-items-center rounded-[20px] bg-white text-[#ea580c] shadow-lg">
                  <Icon d={I.shield} size={32} />
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Made for India */}
      <section className="px-4 py-24 sm:py-32">
        <Head top="Diwali to GST," bottom="already understood." body="Built first for Indian agencies and the brands they run, and ready for clients anywhere." />
        <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
          {[
            ["Festival calendar", "National, regional and global days for 2026 and 2027, with lead times. Plans put festival posts on the right days.", ["Navratri 11 Oct", "Dhanteras 6 Nov", "Diwali 8 Nov"]],
            ["Hinglish and Hindi", "Captions written, improved or translated the way your audience actually talks.", ["Is Diwali, har visit ho meetha."]],
            ["Rupees, IST and GST", "Prices in rupees, times in each client’s time zone, invoices with CGST, SGST or IGST, and UPI.", ["₹ · IST · GST · UPI"]],
          ].map(([t, b, tags], i) => (
            <Reveal key={t as string} delay={i * 110}>
              <article data-spot className="flex h-full flex-col gap-3 rounded-[28px] bg-[#f6f6f8] p-6">
                <h3 className="text-[20px] font-bold tracking-[-0.02em]">{t as string}</h3>
                <p className="text-[15px] leading-relaxed text-black/55">{b as string}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                  {(tags as string[]).map((x, k) => (
                    <span key={x} className={`lx-pop-in rounded-full bg-white px-3 py-1 text-[13px] shadow-sm ${i === 1 ? "lx-serif text-[16px]" : "font-medium"}`} style={{ animationDelay: `${400 + i * 110 + k * 120}ms` }}>
                      {x}
                    </span>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="lx-sky-up scroll-mt-24 px-4 py-24 sm:py-32">
        <Head top="One price per client." bottom="No surprises." body="Every plan has every view, client review links and publishing. Start with 14 days free." />
        <Reveal className="mt-12">
          <Pricing />
        </Reveal>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 px-4 py-24 sm:py-32">
        <Head top="Good questions," bottom="straight answers." />
        <Reveal className="mx-auto mt-12 max-w-3xl">
          <Faq items={FAQ} />
        </Reveal>
      </section>

      {/* Final call to action */}
      <section className="px-4 pb-20">
        <Reveal>
          <div data-live className="relative isolate mx-auto flex max-w-5xl flex-col items-center gap-6 overflow-hidden rounded-[40px] bg-gradient-to-b from-[#ff9b52] via-[#ffc08a] to-[#ffe8d2] px-6 pb-16 pt-14 text-center text-[#1c1206] shadow-[0_40px_80px_-40px_rgb(194_85_20_/_0.6)]">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
              <span className="lx-orb lx-drift-b -left-32 -top-32 size-[420px] bg-[radial-gradient(circle,rgb(255_255_255_/_0.6),transparent_62%)]" />
              <span className="lx-orb lx-drift-a -bottom-40 -right-24 size-[460px] bg-[radial-gradient(circle,rgb(234_88_12_/_0.25),transparent_62%)]" />
            </div>
            <span className="relative">
              <span aria-hidden className="lx-ping is-even absolute inset-0 rounded-[16px] bg-white" />
              <Logo className="relative size-14 rounded-[16px] text-2xl ring-1 ring-white/70" />
            </span>
            <h2 className="lx-head text-[clamp(2.4rem,6vw,4.4rem)]">
              <Words text="Your next month," />
              <br />
              <span className="lx-serif">
                <Words text="already planned." from={3} />
              </span>
            </h2>
            <p className="max-w-lg text-[18px] text-black/65">Connect Instagram and Facebook, get a first audit from your last 90 days, and a month of posts ready to approve.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/sign-up" className="lx-sheen inline-flex h-14 items-center rounded-full bg-[#0a0a0a] px-8 text-[17px] font-semibold text-white transition-transform duration-300 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-[0.98]">
                Start free · 14 days
              </Link>
              <a href="#pricing" className="inline-flex h-14 items-center rounded-full bg-white px-8 text-[17px] font-semibold text-[#9a3d06] transition-transform duration-300 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-[0.98]">
                See pricing
              </a>
            </div>
            <p className="text-[14px] font-medium text-black/55">No card needed · Cancel anytime</p>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-black/5 px-4 py-12">
        <div className="mx-auto flex max-w-5xl flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <p className="flex items-center gap-2.5 text-[17px] font-semibold">
              <Logo /> Plotline
            </p>
            <p className="mt-3 text-[15px] text-black/55">Plan, create, approve, publish and grow social media from one workspace. Made in India.</p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-[15px] sm:grid-cols-3">
            {[
              ["Product", [["#moments", "Use cases"], ["#how", "How it works"], ["#features", "Features"], ["#pricing", "Pricing"]]],
              ["Help", [["#faq", "FAQ"]]],
              ["Account", [["/sign-in", "Sign in"], ["/sign-up", "Start free"]]],
            ].map(([title, links]) => (
              <div key={title as string} className="flex flex-col gap-2.5">
                <b>{title as string}</b>
                {(links as string[][]).map(([href, label]) => (
                  <a key={href} href={href} className="text-black/55 hover:text-black">
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-5xl text-[13px] text-black/40">© {new Date().getFullYear()} Plotline</p>
      </footer>
    </div>
  );
}
