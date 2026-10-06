"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "@/db";
import { users, type OverviewLayout } from "@/db/schema";
import { getOrgContext } from "@/server/tenancy";

const Layout = z.object({
  order: z.array(z.string().max(30)).max(30).optional(),
  hidden: z.array(z.string().max(30)).max(30).optional(),
  sizes: z.record(z.string().max(30), z.union([z.literal(1), z.literal(2)])).optional(),
});

/** OV-01: each person's dashboard (card order, hidden cards and widths). An empty layout resets it. */
export async function saveOverviewLayout(org: string, layout: OverviewLayout) {
  const ctx = await getOrgContext(org);
  const clean = Layout.parse(layout);
  const next = { ...ctx.user.preferences };
  if (Object.keys(clean).length) next.overview = clean;
  else delete next.overview;
  await withOrg(ctx.org.id, (tx) => tx.update(users).set({ preferences: next }).where(eq(users.id, ctx.user.id)));
}
