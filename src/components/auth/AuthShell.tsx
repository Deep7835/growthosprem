import type { ReactNode } from "react";

/** Two-column frame for sign-in and sign-up: the promise on the left, Clerk's form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-ink">G</span>
          Growth OS
        </div>
        <div className="flex max-w-lg flex-col gap-5">
          <h1 className="font-display text-5xl font-bold leading-[1.05]">Plan, approve, publish and grow every client from one place.</h1>
          <ul className="flex flex-col gap-2 text-[15px] text-white/80">
            <li>A first audit of your accounts within minutes of connecting</li>
            <li>Client approvals in one link, no login needed</li>
            <li>Captions in English, Hindi and Hinglish</li>
          </ul>
        </div>
        <p className="text-sm text-white/60">Built for Indian agencies and the brands they grow.</p>
      </section>
      <section className="flex flex-col items-center justify-center gap-6 bg-ground px-4 py-10">
        <div className="flex items-center gap-2 font-display text-lg font-bold lg:hidden">
          <span className="grid size-7 place-items-center rounded-lg bg-accent">G</span>
          Growth OS
        </div>
        {children}
      </section>
    </main>
  );
}
