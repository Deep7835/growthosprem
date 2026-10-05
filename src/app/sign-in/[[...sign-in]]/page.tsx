import { SignIn } from "@clerk/nextjs";
import { AuthSetup } from "@/components/auth/AuthSetup";
import { AuthShell } from "@/components/auth/AuthShell";
import { clerkEnabled } from "@/lib/auth-config";
import { safeRedirect } from "@/lib/safe-redirect";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in/[[...sign-in]]">) {
  // Back to an invite after signing in, for example.
  const next = safeRedirect((await searchParams).redirect_url);
  return (
    <AuthShell>
      {clerkEnabled ? (
        <SignIn
          fallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/onboarding"
          {...(next ? { forceRedirectUrl: next, signUpForceRedirectUrl: next } : {})}
        />
      ) : (
        <AuthSetup />
      )}
    </AuthShell>
  );
}
