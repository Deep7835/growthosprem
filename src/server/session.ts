import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getSystemDb } from "@/db";
import { linkIdentity } from "@/db/accounts";
import { users } from "@/db/schema";
import { clerkEnabled } from "@/lib/auth-config";

export const DEV_USER_COOKIE = "gos_dev_user";

/**
 * "clerk": sign-in through Clerk (needs its keys).
 * "dev": pick a seeded user from the account menu to try each role locally. Never in production.
 * "unconfigured": no Clerk keys yet; nobody is signed in and the sign-in page explains the setup.
 */
export function authMode(): "clerk" | "dev" | "unconfigured" {
  if (process.env.AUTH_MODE === "dev") {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_MODE=dev is not allowed in production.");
    return "dev";
  }
  return clerkEnabled ? "clerk" : "unconfigured";
}

/** The signed-in user, created or linked on first sign-in. Null when signed out. */
export const getSessionUser = cache(async () => {
  const db = await getSystemDb();

  const mode = authMode();
  if (mode === "unconfigured") return null;
  if (mode === "dev") {
    const email = (await cookies()).get(DEV_USER_COOKIE)?.value ?? process.env.DEV_USER_EMAIL ?? "prem@example.com";
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user ?? null;
  }

  const { userId } = await auth();
  if (!userId) return null;
  const [known] = await db.select().from(users).where(eq(users.clerkUserId, userId));
  if (known) return known;

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress ?? clerkUser?.emailAddresses[0];
  if (!clerkUser || !email) return null;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || email.emailAddress.split("@")[0];
  return linkIdentity(db, {
    clerkUserId: userId,
    email: email.emailAddress,
    emailVerified: email.verification?.status === "verified",
    name,
  });
});

export async function listDevUsers() {
  if (authMode() !== "dev") return [];
  const db = await getSystemDb();
  return db.select({ email: users.email, name: users.name }).from(users).orderBy(users.createdAt);
}
