/** Clerk is used once both keys are present (see .env.example). */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export type AuthMode = "clerk" | "dummy" | "dev" | "unconfigured";

/**
 * "clerk": sign-in through Clerk (needs its keys).
 * "dummy": a temporary sign-in with just an email, until a real provider is set up. In production it needs DUMMY_PASSWORD.
 * "dev": pick a seeded user from the account menu to try each role locally. Never in production.
 * "unconfigured": no Clerk keys yet; nobody is signed in and the sign-in page explains the setup.
 */
export function authMode(): AuthMode {
  const production = process.env.NODE_ENV === "production";
  if (process.env.AUTH_MODE === "dev") {
    if (production) throw new Error("AUTH_MODE=dev is not allowed in production.");
    return "dev";
  }
  if (process.env.AUTH_MODE === "dummy") {
    if (production && !process.env.DUMMY_PASSWORD) throw new Error("AUTH_MODE=dummy needs DUMMY_PASSWORD in production.");
    return "dummy";
  }
  return clerkEnabled ? "clerk" : "unconfigured";
}
