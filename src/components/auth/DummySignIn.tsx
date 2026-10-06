"use client";

import Link from "next/link";
import { useActionState } from "react";
import { dummySignIn } from "@/app/actions/dummy-auth";
import { buttonClass } from "@/components/ui";

const field = "h-11 rounded-lg border border-line bg-surface px-3 text-sm font-normal outline-none focus:border-ink";

/** The temporary sign-in form (AUTH_MODE=dummy): no account provider, just an email. */
export function DummySignIn({ kind, next, needsPassword }: { kind: "sign-in" | "sign-up"; next: string | null; needsPassword: boolean }) {
  const [state, action, pending] = useActionState(dummySignIn, {});
  const signUp = kind === "sign-up";
  const other = `${signUp ? "/sign-in" : "/sign-up"}${next ? `?redirect_url=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{signUp ? "Create your account" : "Sign in to Plotline"}</h1>
        <p className="mt-1 text-sm text-muted">{signUp ? "Enter your name and email to get started." : "Enter the email you use with Plotline."}</p>
      </div>
      <form action={action} className="flex flex-col gap-3">
        {next && <input type="hidden" name="next" value={next} />}
        {signUp && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Your name
            <input name="name" required autoComplete="name" maxLength={60} autoFocus className={field} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" autoFocus={!signUp} className={field} />
        </label>
        {needsPassword && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Access password
            <input name="password" type="password" required autoComplete="current-password" className={field} />
          </label>
        )}
        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${buttonClass("primary")} h-11 w-full`}>
          {pending ? "Signing in…" : signUp ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="text-center text-sm text-muted">
        {signUp ? "Already have an account? " : "New to Plotline? "}
        <Link href={other} className="font-medium text-ink underline underline-offset-2">
          {signUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
      <p className="rounded-lg bg-warn-bg px-3 py-2.5 text-xs leading-relaxed text-warn-ink">
        Temporary sign-in for testing: there’s no email check, so anyone {needsPassword ? "with the access password " : ""}can sign in as any email. Real sign-in replaces
        this before launch.
      </p>
    </div>
  );
}
