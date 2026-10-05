// Identity linking and workspace creation. Free of Next.js imports so they can be tested.
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { STATUS_TEMPLATES, type StatusTemplateKey } from "@/lib/status-templates";
import { withOrg, type Db } from "./core";
import * as s from "./schema";

export interface Identity {
  clerkUserId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Finds or creates our user for a signed-in Clerk identity. An existing user who
 * has not signed in yet (seeded, or invited later) is linked by email, but only
 * when Clerk has verified that email, so nobody can claim someone else's account.
 */
export async function linkIdentity(db: Db, identity: Identity) {
  const email = identity.email.trim().toLowerCase();
  const [byClerk] = await db.select().from(s.users).where(eq(s.users.clerkUserId, identity.clerkUserId));
  if (byClerk) return byClerk;

  const [byEmail] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (byEmail) {
    if (byEmail.clerkUserId || !identity.emailVerified) {
      throw new Error("This email already belongs to another account. Sign in with that account or use a different email.");
    }
    const [linked] = await db.update(s.users).set({ clerkUserId: identity.clerkUserId }).where(eq(s.users.id, byEmail.id)).returning();
    return linked;
  }

  const [created] = await db.insert(s.users).values({ email, name: identity.name, clerkUserId: identity.clerkUserId }).returning();
  return created;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "workspace";
}

/** The first free slug: "cafe", then "cafe-2", "cafe-3"… Reads across tenants, so it uses the privileged connection. */
async function freeOrgSlug(db: Db, name: string) {
  const base = slugify(name);
  const taken = new Set((await db.select({ slug: s.organizations.slug }).from(s.organizations).where(like(s.organizations.slug, `${base}%`))).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export interface WorkspaceInput {
  userId: string;
  accountType: "agency" | "brand";
  orgName: string;
  country: string;
  timezone: string;
  spaceName: string;
  spaceColor: string;
  template: StatusTemplateKey;
  trialDays?: number;
  now?: Date;
}

/** Onboarding (OB-02 to OB-04): the organisation, its Owner, the first space and its statuses. */
export async function createWorkspace(db: Db, input: WorkspaceInput) {
  const orgId = randomUUID();
  const slug = await freeOrgSlug(db, input.orgName);
  const now = input.now ?? new Date();

  // Everything is written as the new tenant, so row-level security checks every insert.
  return withOrg(db, orgId, async (tx) => {
    await tx.insert(s.organizations).values({
      id: orgId,
      slug,
      name: input.orgName.trim(),
      accountType: input.accountType,
      country: input.country,
      timezone: input.timezone,
      currency: input.country === "IN" ? "INR" : "USD",
      locale: input.country === "IN" ? "en-IN" : "en-US",
      trialEndsAt: new Date(now.getTime() + (input.trialDays ?? 14) * 864e5),
    });
    await tx.insert(s.memberships).values({ orgId, userId: input.userId, role: "owner" });

    const [space] = await tx
      .insert(s.spaces)
      .values({
        orgId,
        slug: slugify(input.spaceName),
        name: input.spaceName.trim(),
        avatarColor: input.spaceColor,
        timezone: input.timezone,
        // Agencies need client sign-off before publishing; brands approve their own posts (OB-03).
        requireClientApproval: input.accountType === "agency",
      })
      .returning();
    await tx.insert(s.statuses).values(
      STATUS_TEMPLATES[input.template].statuses.map(([name, color, category, reviewRole, autopost], position) => ({
        orgId,
        spaceId: space.id,
        name,
        color,
        category,
        reviewRole,
        position,
        autopostEligible: autopost ?? false,
      })),
    );
    return { orgId, orgSlug: slug, spaceSlug: space.slug };
  });
}

/** The organisations a user belongs to, for routing after sign-in. */
export async function userOrgSlugs(db: Db, userId: string) {
  const rows = await db
    .select({ slug: s.organizations.slug })
    .from(s.memberships)
    .innerJoin(s.organizations, eq(s.organizations.id, s.memberships.orgId))
    .where(eq(s.memberships.userId, userId));
  return rows.map((r) => r.slug);
}

/** Development only: adds a user to the seeded demo agency as an Admin. */
export async function joinDemoWorkspace(db: Db, userId: string) {
  const [demo] = await db.select().from(s.organizations).where(eq(s.organizations.slug, "knockknockclub"));
  if (!demo) return null;
  await withOrg(db, demo.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(s.memberships)
      .where(and(eq(s.memberships.orgId, demo.id), eq(s.memberships.userId, userId)));
    if (!existing) await tx.insert(s.memberships).values({ orgId: demo.id, userId, role: "admin" });
  });
  return demo.slug;
}

