import "server-only";
import type { Tx } from "@/db";
import { activityLog } from "@/db/schema";

export type Actor =
  | { kind: "user"; userId: string; name: string }
  // A change the AI Copilot made after this person approved it (CT-11).
  | { kind: "ai"; userId: string; name: string }
  | { kind: "reviewer"; name: string }
  | { kind: "system" };

/** Records one change for the content panel's change log (CT-11). */
export async function logActivity(
  tx: Tx,
  entry: {
    orgId: string;
    spaceId: string;
    contentItemId: string;
    actor: Actor;
    action: string;
    field?: string;
    before?: unknown;
    after?: unknown;
  },
) {
  const { actor } = entry;
  await tx.insert(activityLog).values({
    orgId: entry.orgId,
    spaceId: entry.spaceId,
    targetType: "content_item",
    targetId: entry.contentItemId,
    actorKind: actor.kind,
    actorUserId: actor.kind === "user" || actor.kind === "ai" ? actor.userId : null,
    actorLabel:
      actor.kind === "user"
        ? actor.name
        : actor.kind === "ai"
          ? `AI Copilot for ${actor.name}`
          : actor.kind === "reviewer"
            ? `${actor.name} (client)`
            : "System",
    action: entry.action,
    field: entry.field ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
