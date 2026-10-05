import { SignUp } from "@clerk/nextjs";
import { AuthSetup } from "@/components/auth/AuthSetup";
import { AuthShell } from "@/components/auth/AuthShell";
import { clerkEnabled } from "@/lib/auth-config";
import { safeRedirect } from "@/lib/safe-redirect";

export const metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up/[[...sign-up]]">) {
  // Back to an invite after signing up, instead of onboarding.
  const next = safeRedirect((await searchParams).redirect_url);
  return (
    <AuthShell>
      {clerkEnabled ? (
        <SignUp
          fallbackRedirectUrl="/onboarding"
          signInFallbackRedirectUrl="/"
          {...(next ? { forceRedirectUrl: next, signInForceRedirectUrl: next } : {})}
        />
      ) : (
        <AuthSetup />
      )}
    </AuthShell>
  );
}
