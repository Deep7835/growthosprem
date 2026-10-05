// Demo data matching the PRD's examples: KnockKnockClub agency, Cafe and Real estate spaces.
// Runs with the privileged connection, before any tenant exists.
import { sql } from "drizzle-orm";
import type { Db } from "./core";
import { STATUS_TEMPLATES, TASK_STATUSES, type StatusSeed } from "@/lib/status-templates";
import * as s from "./schema";

const AGENCY_PIPELINE = STATUS_TEMPLATES.agency.statuses;
const DEFAULT_TEMPLATE = STATUS_TEMPLATES.default.statuses;

const ist = (local: string) => new Date(`${local}:00+05:30`);

export async function seedIfEmpty(db: Db): Promise<boolean> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.organizations);
  if (count > 0) return false;
  await seed(db);
  return true;
}

export async function seed(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(s.organizations)
      .values({ slug: "knockknockclub", name: "KnockKnockClub", brandColor: "#17181C" })
      .returning();

    const [prem, rahul, riya] = await tx
      .insert(s.users)
      .values([
        { email: "prem@example.com", name: "Prem" },
        { email: "rahul@example.com", name: "Rahul" },
        { email: "riya@example.com", name: "Riya" },
        // No workspace: signs in to onboarding.
        { email: "neha@example.com", name: "Neha" },
      ])
      .returning();

    await tx.insert(s.memberships).values([
      { orgId: org.id, userId: prem.id, role: "owner" },
      { orgId: org.id, userId: rahul.id, role: "manager" },
      { orgId: org.id, userId: riya.id, role: "editor" },
    ]);

    const [cafe, realEstate] = await tx
      .insert(s.spaces)
      .values([
        { orgId: org.id, slug: "cafe", name: "Cafe", avatarColor: "#F2A93B" },
        { orgId: org.id, slug: "real-estate", name: "Real estate", avatarColor: "#7FC8A9" },
      ])
      .returning();

    await tx.insert(s.spaceMembers).values([
      { orgId: org.id, spaceId: cafe.id, userId: rahul.id },
      { orgId: org.id, spaceId: realEstate.id, userId: rahul.id },
      { orgId: org.id, spaceId: cafe.id, userId: riya.id },
    ]);

    const insertStatuses = (spaceId: string, template: readonly StatusSeed[]) =>
      tx
        .insert(s.statuses)
        .values(
          template.map(([name, color, category, reviewRole, autopost], position) => ({
            orgId: org.id,
            spaceId,
            name,
            color,
            category,
            reviewRole,
            position,
            autopostEligible: autopost ?? false,
          })),
        )
        .returning();

    const cafeStatuses = await insertStatuses(cafe.id, AGENCY_PIPELINE);
    await insertStatuses(realEstate.id, DEFAULT_TEMPLATE);
    const st = Object.fromEntries(cafeStatuses.map((x) => [x.name, x.id]));
    const taskStatuses = (spaceId: string) =>
      tx
        .insert(s.statuses)
        .values(TASK_STATUSES.map(([name, color, category], i) => ({ orgId: org.id, spaceId, name, color, category, appliesTo: "task" as const, position: 100 + i })))
        .returning();
    const cafeTaskStatuses = await taskStatuses(cafe.id);
    await taskStatuses(realEstate.id);
    const taskStatus = (done: boolean) => cafeTaskStatuses.find((x) => x.category === (done ? "completed" : "not_started"))!.id;

    const [ig, fb] = await tx
      .insert(s.socialAccounts)
      .values([
        { orgId: org.id, spaceId: cafe.id, platform: "instagram", handle: "@cafe.delhi", accountType: "business" },
        { orgId: org.id, spaceId: cafe.id, platform: "facebook", handle: "Cafe Delhi", accountType: "page" },
      ])
      .returning();

    const [diwali] = await tx
      .insert(s.projects)
      .values([
        { orgId: org.id, spaceId: cafe.id, name: "Diwali 2026", goal: "Sell out the Diwali sweets box", startsOn: "2026-10-26", endsOn: "2026-11-08" },
        { orgId: org.id, spaceId: cafe.id, name: "Menu launch" },
      ])
      .returning();

    type Kind = (typeof s.placementKind.enumValues)[number];
    const items: {
      title: string;
      status: string;
      kinds: Kind[];
      at?: Date;
      project?: string;
      pillar?: string;
      caption?: string;
      hashtags?: string;
      assignees: string[];
      publishState?: (typeof s.publishState.enumValues)[number];
    }[] = [
      { title: "Monsoon menu teaser", status: "Idea", kinds: ["ig_reel"], pillar: "Product", assignees: [] },
      { title: "Customer reactions", status: "Idea", kinds: ["ig_reel"], at: ist("2026-11-01T11:00"), project: diwali.id, pillar: "Community", assignees: [] },
      { title: "Behind the scenes in the kitchen", status: "Brief", kinds: ["ig_reel", "fb_reel"], at: ist("2026-10-29T18:00"), project: diwali.id, pillar: "Behind the scenes", assignees: [riya.id] },
      { title: "Barista day in life", status: "In progress", kinds: ["ig_reel", "fb_reel"], at: ist("2026-10-15T18:00"), pillar: "Behind the scenes", caption: "From the 6 AM grind to the last cappuccino. A day with our head barista.", assignees: [prem.id, riya.id] },
      { title: "5 coffee myths", status: "Internal review", kinds: ["ig_carousel"], at: ist("2026-10-16T09:00"), pillar: "Education", caption: "Myth 1: dark roast has more caffeine. Swipe for the truth about your morning cup.", assignees: [riya.id] },
      { title: "Teaser: Something sweet is coming", status: "Client review", kinds: ["ig_reel"], at: ist("2026-10-26T18:00"), project: diwali.id, pillar: "Offer", caption: "Something sweet is coming to Cafe this Diwali. Can you guess what it is? Drop your guess below.", assignees: [rahul.id] },
      { title: "5 Diwali sweets to try this year", status: "Client review", kinds: ["ig_carousel"], at: ist("2026-10-28T13:00"), project: diwali.id, pillar: "Education", caption: "From kaju katli to our coffee barfi, here are five sweets our team cannot stop eating. Save this for your Diwali list.", hashtags: "#diwali #sweets #delhifood", assignees: [rahul.id, riya.id] },
      { title: "Diwali offer: 20% off all sweets", status: "Client review", kinds: ["ig_post", "fb_post"], at: ist("2026-10-31T19:00"), project: diwali.id, pillar: "Offer", caption: "Is Diwali, har visit ho meetha. 20% off all sweets from 1 to 8 Nov. Tag the friend who owes you a treat.", hashtags: "#diwali #cafe #delhifood", assignees: [prem.id, rahul.id] },
      { title: "Weekend brunch", status: "Approved", kinds: ["ig_story"], at: ist("2026-10-18T10:00"), pillar: "Offer", caption: "Brunch is on. Saturday and Sunday, 9 AM to 1 PM.", assignees: [rahul.id], publishState: "scheduled" },
    ];

    for (const [i, it] of items.entries()) {
      const [row] = await tx
        .insert(s.contentItems)
        .values({
          orgId: org.id,
          spaceId: cafe.id,
          projectId: it.project ?? null,
          title: it.title,
          statusId: st[it.status],
          publishState: it.publishState ?? "not_scheduled",
          pillar: it.pillar ?? null,
          scheduledAt: it.at ?? null,
          autopost: it.publishState === "scheduled",
          caption: it.caption ?? "",
          hashtags: it.hashtags ?? "",
          position: i,
          createdBy: prem.id,
        })
        .returning();

      await tx.insert(s.placements).values(
        it.kinds.map((kind) => ({
          orgId: org.id,
          contentItemId: row.id,
          kind,
          socialAccountId: kind.startsWith("ig_") ? ig.id : kind.startsWith("fb_") ? fb.id : null,
          // The worker queues their publish jobs when they come due (src/publishing/reconcile.ts).
          state: it.publishState === "scheduled" ? ("scheduled" as const) : ("draft" as const),
        })),
      );
      if (it.assignees.length) {
        await tx
          .insert(s.contentAssignees)
          .values(it.assignees.map((userId) => ({ orgId: org.id, contentItemId: row.id, userId })));
      }
      await tx.insert(s.activityLog).values({
        orgId: org.id,
        spaceId: cafe.id,
        targetType: "content_item",
        targetId: row.id,
        actorKind: "user",
        actorUserId: prem.id,
        actorLabel: "Prem",
        action: "created",
      });

      if (it.title === "Barista day in life") {
        await tx.insert(s.tasks).values(
          [
            ["Script", true],
            ["Shoot", true],
            ["Edit", false],
            ["Thumbnail", false],
          ].map(([title, done], n) => ({
            orgId: org.id,
            spaceId: cafe.id,
            contentItemId: row.id,
            title: title as string,
            done: done as boolean,
            statusId: taskStatus(done as boolean),
            position: n,
            createdBy: prem.id,
            assigneeId: riya.id,
            dueAt: ist(`2026-10-${String(8 + n * 2).padStart(2, "0")}T18:00`),
          })),
        );
      }
      if (it.title.startsWith("Diwali offer")) {
        await tx.insert(s.comments).values({
          orgId: org.id,
          contentItemId: row.id,
          authorUserId: rahul.id,
          visibility: "private",
          body: "@Prem cover photo is final, caption needs the offer dates.",
        });
        await tx.insert(s.notifications).values({
          orgId: org.id,
          userId: prem.id,
          spaceId: cafe.id,
          kind: "mention",
          title: `Rahul mentioned you on “${it.title}”`,
          body: "@Prem cover photo is final, caption needs the offer dates.",
          href: `/o/${org.slug}/s/${cafe.slug}/board?content=${row.id}`,
        });
      }
    }
  });
}
