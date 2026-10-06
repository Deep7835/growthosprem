"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSystemDb } from "@/db";
import { users } from "@/db/schema";
import { DUMMY_SESSION_COOKIE, DUMMY_SESSION_DAYS, passwordMatches, sessionValue } from "@/lib/dummy-session";
import { safeRedirect } from "@/lib/safe-redirect";
import { authMode, dummySessionKey } from "@/server/session";

export type DummySignInState = { error?: string };

const input = z.object({
  email: z.email("Enter a valid email address.").transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().max(60, "Keep your name under 60 characters."),
  password: z.string(),
});

/** The temporary sign-in: an email (and a name for new accounts). Only with AUTH_MODE=dummy. */
export async function dummySignIn(_: DummySignInState, formData: FormData): Promise<DummySignInState> {
  if (authMode() !== "dummy") return { error: "This sign-in is turned off." };
  const parsed = input.safeParse({ email: formData.get("email"), name: formData.get("name") ?? "", password: formData.get("password") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, name, password } = parsed.data;
  const shared = process.env.DUMMY_PASSWORD;
  if (shared && !passwordMatches(password, shared)) return { error: "That password isn’t right." };

  const db = await getSystemDb();
  let [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: name || email.split("@")[0] }).returning({ id: users.id });

  (await cookies()).set(DUMMY_SESSION_COOKIE, sessionValue(user.id, dummySessionKey()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUMMY_SESSION_DAYS * 86400,
  });
  redirect(safeRedirect(formData.get("next")) ?? "/");
}

/** Signs out, then back to sign-in (and on to `next` afterwards, such as an invite). */
export async function dummySignOut(formData?: FormData) {
  (await cookies()).delete(DUMMY_SESSION_COOKIE);
  const next = safeRedirect(formData?.get("next"));
  redirect(next ? `/sign-in?redirect_url=${encodeURIComponent(next)}` : "/sign-in");
}
