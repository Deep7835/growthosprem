import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";

export const REVIEWER_COOKIE = "gos_reviewer";

export const reviewerSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(80),
  email: z.union([z.literal(""), z.email()]).optional(),
});

/** The client reviewer's name and optional email, remembered in a cookie on this device. */
export async function readReviewer(): Promise<z.infer<typeof reviewerSchema> | null> {
  const raw = (await cookies()).get(REVIEWER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return reviewerSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
