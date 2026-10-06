/** Shown on the sign-in page until Clerk keys are configured. */
export function AuthSetup() {
  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
      <h1 className="font-display text-2xl font-bold">Sign-in isn’t set up yet</h1>
      <p className="text-sm leading-relaxed text-ink-2">
        Plotline uses Clerk for sign-in. Add your Clerk keys to <code className="rounded bg-ground px-1">.env.local</code> and restart the
        app:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-ink p-3 text-xs text-white">
        {"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…\nCLERK_SECRET_KEY=sk_test_…"}
      </pre>
      <p className="text-sm leading-relaxed text-muted">
        Get them from the Clerk dashboard under API keys, or run <code className="rounded bg-ground px-1">npx clerk@latest init</code> to create
        development keys. To try the app without Clerk, set <code className="rounded bg-ground px-1">AUTH_MODE=dev</code>.
      </p>
    </div>
  );
}
