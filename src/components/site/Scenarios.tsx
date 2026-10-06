"use client";

import { useEffect, useRef, useState } from "react";

type Id = "festival" | "approval" | "caption" | "failure" | "results";

const SCENES: { id: Id; label: string; toast: [string, string]; caption: string }[] = [
  { id: "festival", label: "Diwali week", toast: ["5 posts added to the calendar", "Planned around Dhanteras and Diwali"], caption: "A festival is ten days out and nothing is planned. Ask for the week and get Reels, a carousel and an offer post on the right evenings." },
  { id: "approval", label: "Client approval", toast: ["Approved by Anjali", "From the review link, no login"], caption: "The client approves from a link on their phone. The post moves on by itself, and an edit later sends it back for review." },
  { id: "caption", label: "Hinglish caption", toast: ["Caption updated", "Instagram only · Facebook keeps its own"], caption: "Rewrite a caption in Hinglish or Hindi for one platform, keep the other as it is, and see both previews side by side." },
  { id: "failure", label: "Failed post", toast: ["Published on retry", "Instagram Reel · 7:02 PM"], caption: "A post didn’t go out. You see why in plain words, it retries when it can, and the right person is told if it can’t." },
  { id: "results", label: "Monthly results", toast: ["Added to next month’s plan", "2 question-hook Reels a week"], caption: "Results by format, pillar, topic and hook. The pattern that works becomes next month’s plan in one click." },
];

function Toast({ title, body }: { title: string; body: string }) {
  return (
    <div className="absolute inset-x-0 top-4 z-10 flex justify-center px-4">
      <div className="lx-pop flex max-w-full items-center gap-2.5 rounded-full bg-[#12141c]/95 py-2 pl-2 pr-5 text-white shadow-2xl" style={{ animationDelay: "900ms" }}>
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f97316] text-sm">✓</span>
        <span className="min-w-0 text-[13px] leading-tight">
          <b className="block truncate">{title}</b>
          <span className="block truncate text-white/60">{body}</span>
        </span>
      </div>
    </div>
  );
}

function Card({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`lx-pop rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0_/_0.06)] ring-1 ring-black/5 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Scene({ id }: { id: Id }) {
  switch (id) {
    case "festival":
      return (
        <div className="grid grid-cols-7 gap-1.5 text-[11px]">
          {["Mon 2", "Tue 3", "Wed 4", "Thu 5", "Fri 6", "Sat 7", "Sun 8"].map((d, i) => (
            <div key={d} className="flex min-h-[170px] flex-col gap-1.5 rounded-xl bg-white/70 p-1.5 ring-1 ring-black/5">
              <span className="text-center text-[10px] font-semibold text-black/50">{d}</span>
              {i === 4 && <span className="rounded-md bg-[#fff1d6] px-1 text-center text-[9px] font-semibold text-[#8a5300]">Dhanteras</span>}
              {i === 6 && <span className="rounded-md bg-[#fff1d6] px-1 text-center text-[9px] font-semibold text-[#8a5300]">Diwali</span>}
              {[[1, "Diya making", "Reel"], [2, "Gift guide", "Carousel"], [3, "Behind the scenes", "Reel"], [4, "20% off sweets", "Offer"], [6, "Happy Diwali", "Reel"]]
                .filter(([d]) => d === i)
                .map(([, t, f], k) => (
                  <Card key={t as string} delay={200 + i * 90 + k * 60} className="!rounded-lg !p-1.5">
                    <p className="text-[10px] font-semibold leading-tight">{t}</p>
                    <p className="text-[9px] text-black/45">{f} · 7 PM</p>
                  </Card>
                ))}
            </div>
          ))}
        </div>
      );
    case "approval":
      return (
        <div className="mx-auto flex max-w-[360px] flex-col gap-2.5">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-black/40">Cafe · for your review</p>
            <p className="text-sm font-semibold">3 posts from your agency</p>
          </Card>
          {[
            ["5 Diwali sweets to try", "Approved", "bg-[#dcfce7] text-[#166534]"],
            ["Diwali offer: 20% off", "Changes asked", "bg-[#fef3c7] text-[#92400e]"],
            ["Teaser: something sweet", "Waiting", "bg-black/5 text-black/50"],
          ].map(([t, s, tone], i) => (
            <Card key={t} delay={150 + i * 120} className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">{t}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>{s}</span>
            </Card>
          ))}
        </div>
      );
    case "caption":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <p className="text-[11px] font-semibold text-black/40">Instagram</p>
            <p className="mt-1 text-[13px] leading-snug">Is Diwali, har visit ho meetha. 20% off all sweets, 1 to 8 Nov. Tag the friend who owes you a treat.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {["Improve", "Shorten", "Hinglish", "Hindi", "Hooks"].map((x) => (
                <span key={x} className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold">
                  {x}
                </span>
              ))}
            </div>
          </Card>
          <Card delay={200}>
            <p className="text-[11px] font-semibold text-black/40">Facebook</p>
            <p className="mt-1 text-[13px] leading-snug">This Diwali, every visit is a sweet one. 20% off all our sweets from 1 to 8 November. Order on WhatsApp from our Page.</p>
            <p className="mt-2 text-[10px] text-black/45">Its own caption · 63,206 characters allowed</p>
          </Card>
        </div>
      );
    case "failure":
      return (
        <div className="mx-auto flex max-w-[380px] flex-col gap-2">
          {[
            ["Instagram Reel", "@cafe.delhi", "Published", "bg-[#dcfce7] text-[#166534]"],
            ["Facebook Reel", "Cafe Delhi", "Published", "bg-[#dcfce7] text-[#166534]"],
            ["Instagram Story", "@cafe.delhi", "Scheduled", "bg-[#dbeafe] text-[#1e40af]"],
          ].map(([p, h, s, tone], i) => (
            <Card key={p} delay={i * 110} className="flex items-center justify-between !py-2.5">
              <span className="text-[13px]">
                <b>{p}</b> <span className="text-black/45">· {h}</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>{s}</span>
            </Card>
          ))}
          <Card delay={400} className="!bg-[#fff7f5] !ring-[#fecaca]">
            <p className="text-[12px] text-[#9a3412]">
              <b>First try failed:</b> Instagram was busy (temporary). Retried at 7:02 PM.
            </p>
          </Card>
        </div>
      );
    default:
      return (
        <div className="mx-auto flex max-w-[420px] flex-col gap-2.5">
          <Card>
            <p className="flex justify-between text-[12px]">
              <b>Engagement rate by hook</b>
              <span className="rounded bg-black/5 px-1.5 text-[10px] text-black/45">sample</span>
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {[
                ["Question", 92],
                ["Behind the scenes", 76],
                ["Offer", 58],
                ["Number or list", 44],
              ].map(([n, v], i) => (
                <div key={n} className="grid grid-cols-[120px_1fr] items-center gap-2 text-[11px]">
                  <span>{n}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-black/5">
                    <span className="lx-grow-x block h-full rounded-full bg-gradient-to-r from-[#fdba74] to-[#ea580c]" style={{ width: `${v}%`, animationDelay: `${200 + i * 120}ms` }} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card delay={500}>
            <p className="text-[12px]">
              <b>Question hooks</b> get the most comments for Cafe. Open two Reels a week with a question.
            </p>
          </Card>
        </div>
      );
  }
}

/** "Made for moments": pick a situation and watch it play out. Moves on by itself until someone picks one. */
export function Scenarios() {
  const [id, setId] = useState<Id>("festival");
  const [auto, setAuto] = useState(true);
  // Only moves on while someone can see it; scrolling back restarts the current scene's timer.
  const root = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.25 });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!auto || !seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setId(SCENES[(SCENES.findIndex((s) => s.id === id) + 1) % SCENES.length].id), 7000);
    return () => clearTimeout(t);
  }, [id, auto, seen]);
  const scene = SCENES.find((s) => s.id === id)!;

  return (
    <div ref={root} className="flex flex-col items-center gap-8">
      <div role="tablist" aria-label="Use cases" className="-mx-4 flex max-w-full gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {SCENES.map((s) => {
          const on = s.id === id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="scene"
              onClick={() => {
                setId(s.id);
                setAuto(false);
              }}
              className={`relative shrink-0 overflow-hidden rounded-full px-5 py-2.5 text-[15px] font-medium transition duration-300 active:scale-[0.97] ${on ? "bg-black text-white" : "bg-[#f2f2f4] text-black/70 hover:bg-[#e9e9ec]"}`}
            >
              <span className="relative">{s.label}</span>
              {on && auto && seen && <span aria-hidden className="lx-progress absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-white/50" />}
            </button>
          );
        })}
      </div>
      <div id="scene" role="tabpanel" className="w-full">
        <div className="lx-sky-up relative mx-auto max-w-[760px] overflow-hidden rounded-[32px] p-4 pt-20 sm:p-6 sm:pt-24">
          <div key={id}>
            <Toast title={scene.toast[0]} body={scene.toast[1]} />
            <Scene id={id} />
          </div>
        </div>
        <p key={`c-${id}`} className="lx-pop mx-auto mt-6 max-w-xl text-center text-[17px] text-black/55">
          {scene.caption}
        </p>
      </div>
    </div>
  );
}
