import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/site/Nav";

export const metadata: Metadata = { title: { absolute: "Plotline · Opening soon" }, robots: { index: false } };

/** Where Sign in and Start free lead until the app is hosted (see site/next.config.ts). */
export default function Start() {
  return (
    <main className="lx lx-sky grid min-h-dvh place-items-center px-4 text-center text-[#1c1206]" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="flex max-w-md flex-col items-center gap-5">
        <Logo className="size-14 rounded-[16px] text-2xl" />
        <h1 className="lx-head text-[clamp(2.2rem,7vw,3.2rem)]">Plotline is opening soon.</h1>
        <p className="text-[18px] leading-relaxed text-black/60">Accounts aren’t open yet. Have a look around the site in the meantime.</p>
        <Link href="/" className="inline-flex h-12 items-center rounded-full bg-[#0a0a0a] px-7 text-[16px] font-semibold text-white transition-transform hover:scale-[1.03]">
          Back to the site
        </Link>
      </div>
    </main>
  );
}
