import "server-only";
import { createHmac } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getSystemDb } from "@/db";
import { linkIdentity } from "@/db/accounts";
import { users } from "@/db/schema";
import { authMode } from "@/lib/auth-config";
import { tokenKey } from "@/lib/crypto";
import { DUMMY_SESSION_COOKIE, readSession } from "@/lib/dummy-session";

export const DEV_USER_COOKIE = "gos_dev_user";

export { authMode };

/** The key that signs dummy sign-in cookies, derived from the token encryption key. */
export function dummySessionKey() {
  return createHmac("sha256", tokenKey()).update("plotline-dummy-session").digest();
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
  if (mode === "dummy") {
    const userId = readSession((await cookies()).get(DUMMY_SESSION_COOKIE)?.value, dummySessionKey());
    if (!userId) return null;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
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
