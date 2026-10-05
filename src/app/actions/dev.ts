"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSystemDb } from "@/db";
import { users } from "@/db/schema";
import { DEV_USER_COOKIE, authMode } from "@/server/session";

/** Switch between seeded users to try each role. Only with AUTH_MODE=dev, never in production. */
export async function switchDevUser(formData: FormData) {
  if (authMode() !== "dev") throw new Error("User switching is only available with AUTH_MODE=dev.");
  const email = String(formData.get("email") ?? "");
  const db = await getSystemDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error("Unknown user.");
  (await cookies()).set(DEV_USER_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}
