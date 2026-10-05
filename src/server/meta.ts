import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { getSystemDb, withOrg } from "@/db";
import { activityLog, oauthSessions, socialAccounts, spaces } from "@/db/schema";
import { enqueueImport, enqueueManualSync } from "@/jobs/meta-sync";
import { openToken, sealToken } from "@/lib/crypto";
import { getGraph, type PageCandidate } from "@/lib/meta";
import { tokenStatus } from "@/lib/meta/health";
import type { SpaceContext } from "./tenancy";

const SESSION_MINUTES = 15;

export interface PickerOption {
  key: string;
  platform: "instagram" | "facebook";
  handle: string;
  detail: string;
  followers: number | null;
  connectedHere: boolean;
  /** Name of the other space this account is already connected to. */
  connectedIn: string | null;
}

/** After Meta's login: keeps the Pages (with their tokens, encrypted) for the picker. */
export async function createOAuthSession(ctx: SpaceContext, pages: PageCandidate[]) {
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx
      .insert(oauthSessions)
      .values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        userId: ctx.user.id,
        provider: "meta",
        dataEnc: sealToken(JSON.stringify(pages)),
        expiresAt: new Date(Date.now() + SESSION_MINUTES * 60_000),
      })
      .returning({ id: oauthSessions.id }),
  );
  return row.id;
}

async function readSession(ctx: SpaceContext, sessionId: string): Promise<PageCandidate[] | null> {
  if (!/^[0-9a-f-]{36}$/.test(sessionId)) return null;
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx
      .select()
      .from(oauthSessions)
      .where(
        and(
          eq(oauthSessions.id, sessionId),
          eq(oauthSessions.userId, ctx.user.id),
          eq(oauthSessions.spaceId, ctx.space.id),
          gt(oauthSessions.expiresAt, new Date()),
        ),
      ),
  );
  return row ? (JSON.parse(openToken(row.dataEnc)) as PageCandidate[]) : null;
}

function optionsFrom(pages: PageCandidate[]) {
  return pages.flatMap((p) => [
    {
      key: `facebook:${p.pageId}`,
      platform: "facebook" as const,
      externalId: p.pageId,
      pageId: p.pageId,
      handle: p.pageName,
      detail: "Facebook Page",
      followers: p.followers,
      token: p.pageToken,
    },
    ...(p.instagram
      ? [
          {
            key: `instagram:${p.instagram.id}`,
            platform: "instagram" as const,
            externalId: p.instagram.id,
            pageId: p.pageId,
            handle: `@${p.instagram.username}`,
            detail: `Instagram professional account, linked to ${p.pageName}`,
            followers: p.instagram.followers,
            token: p.pageToken,
          },
        ]
      : []),
  ]);
}

/** The accounts the person can pick from, without tokens. Null if the session is gone. */
export async function pickerOptions(ctx: SpaceContext, sessionId: string): Promise<{ options: PickerOption[]; pagesWithoutInstagram: string[] } | null> {
  const pages = await readSession(ctx, sessionId);
  if (!pages) return null;
  const options = optionsFrom(pages);
  const existing = options.length
    ? await withOrg(ctx.org.id, (tx) =>
        tx
          .select({ platform: socialAccounts.platform, externalId: socialAccounts.externalId, spaceId: socialAccounts.spaceId, spaceName: spaces.name })
          .from(socialAccounts)
          .innerJoin(spaces, eq(spaces.id, socialAccounts.spaceId))
          .where(and(inArray(socialAccounts.externalId, options.map((o) => o.externalId)), ne(socialAccounts.status, "disconnected"))),
      )
    : [];
  return {
    options: options.map((o) => {
      const matches = existing.filter((e) => e.platform === o.platform && e.externalId === o.externalId);
      const here = matches.some((m) => m.spaceId === ctx.space.id);
      return {
        key: o.key,
        platform: o.platform,
        handle: o.handle,
        detail: o.detail,
        followers: o.followers,
        connectedHere: here,
        connectedIn: here ? null : (matches[0]?.spaceName ?? null),
      };
    }),
    pagesWithoutInstagram: pages.filter((p) => !p.instagram).map((p) => p.pageName),
  };
}

/**
 * Connects the chosen accounts to the space (or reconnects them), replaces the space's
 * sample accounts on the same platform, and queues the 90-day history import (OB-07).
 */
export async function connectAccounts(ctx: SpaceContext, sessionId: string, keys: string[]) {
  const graph = getGraph();
  if (!graph) throw new Error("Instagram and Facebook aren’t set up yet.");
  const pages = await readSession(ctx, sessionId);
  if (!pages) throw new Error("This connection timed out. Start again with “Connect”.");
  const chosen = optionsFrom(pages).filter((o) => keys.includes(o.key));
  if (chosen.length === 0) throw new Error("Choose at least one account.");

  const now = new Date();
  const health = await Promise.all(chosen.map((o) => graph.inspectToken(o.token)));

  const ids = await withOrg(ctx.org.id, async (tx) => {
    const elsewhere = await tx
      .select({ platform: socialAccounts.platform, externalId: socialAccounts.externalId, spaceName: spaces.name })
      .from(socialAccounts)
      .innerJoin(spaces, eq(spaces.id, socialAccounts.spaceId))
      .where(and(ne(socialAccounts.spaceId, ctx.space.id), ne(socialAccounts.status, "disconnected"), inArray(socialAccounts.externalId, chosen.map((o) => o.externalId))));
    const clash = chosen.find((o) => elsewhere.some((e) => e.platform === o.platform && e.externalId === o.externalId));
    if (clash) {
      const where = elsewhere.find((e) => e.externalId === clash.externalId)!.spaceName;
      throw new Error(`${clash.handle} is already connected to ${where}. Disconnect it there first.`);
    }

    // Seeded sample accounts give way to the real thing (their sample posts go with them).
    const platforms = [...new Set(chosen.map((o) => o.platform))];
    await tx
      .delete(socialAccounts)
      .where(
        and(
          eq(socialAccounts.spaceId, ctx.space.id),
          inArray(socialAccounts.platform, platforms),
          eq(socialAccounts.isDemo, true),
          isNull(socialAccounts.accessTokenEnc),
        ),
      );

    const out: string[] = [];
    for (const [i, o] of chosen.entries()) {
      const info = health[i];
      const fields = {
        handle: o.handle,
        name: o.handle,
        pageId: o.pageId,
        accountType: o.platform === "instagram" ? "professional" : "page",
        accessTokenEnc: sealToken(o.token),
        tokenExpiresAt: info.expiresAt,
        status: info.valid ? tokenStatus(info.expiresAt, now) : ("reconnect_needed" as const),
        statusReason: null,
        connectedBy: ctx.user.id,
        syncState: "import_queued",
        syncProgress: null,
        isDemo: graph.fake,
      };
      const [row] = await tx
        .insert(socialAccounts)
        .values({ orgId: ctx.org.id, spaceId: ctx.space.id, platform: o.platform, externalId: o.externalId, ...fields })
        .onConflictDoUpdate({ target: [socialAccounts.spaceId, socialAccounts.platform, socialAccounts.externalId], set: fields })
        .returning({ id: socialAccounts.id });
      await tx.insert(activityLog).values({
        orgId: ctx.org.id,
        spaceId: ctx.space.id,
        targetType: "social_account",
        targetId: row.id,
        actorKind: "user",
        actorUserId: ctx.user.id,
        actorLabel: ctx.user.name,
        action: "connected",
      });
      out.push(row.id);
    }
    await tx.delete(oauthSessions).where(eq(oauthSessions.id, sessionId));
    return out;
  });

  const db = await getSystemDb();
  for (const id of ids) await enqueueImport(db, id, now);
  return ids.length;
}

async function accountInSpace(ctx: SpaceContext, accountId: string) {
  const [row] = await withOrg(ctx.org.id, (tx) =>
    tx
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.spaceId, ctx.space.id))),
  );
  if (!row) throw new Error("That account isn’t connected to this space.");
  return row;
}

/** Stops syncing and deletes the stored token. Imported history stays for analytics. */
export async function disconnectAccount(ctx: SpaceContext, accountId: string) {
  const account = await accountInSpace(ctx, accountId);
  await withOrg(ctx.org.id, async (tx) => {
    if (account.isDemo && !account.accessTokenEnc) {
      // A seeded sample account has nothing to disconnect; remove it and its sample posts.
      await tx.delete(socialAccounts).where(eq(socialAccounts.id, account.id));
      return;
    }
    await tx
      .update(socialAccounts)
      .set({ status: "disconnected", accessTokenEnc: null, tokenExpiresAt: null, syncState: null, syncProgress: null, statusReason: null })
      .where(eq(socialAccounts.id, account.id));
    await tx.insert(activityLog).values({
      orgId: ctx.org.id,
      spaceId: ctx.space.id,
      targetType: "social_account",
      targetId: account.id,
      actorKind: "user",
      actorUserId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "disconnected",
    });
  });
}

/** Queues a sync for the space's live accounts. Returns how many were queued. */
export async function requestSync(ctx: SpaceContext, accountId?: string) {
  const accounts = await withOrg(ctx.org.id, (tx) =>
    tx
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.spaceId, ctx.space.id), inArray(socialAccounts.status, ["active", "expiring"]))),
  );
  const live = accounts.filter((a) => a.accessTokenEnc && (!accountId || a.id === accountId) && !a.syncState);
  if (live.length === 0) return 0;
  const db = await getSystemDb();
  let queued = 0;
  for (const a of live) {
    if ((await enqueueManualSync(db, [a.id])) === 0) continue;
    queued++;
    await withOrg(ctx.org.id, (tx) => tx.update(socialAccounts).set({ syncState: "queued" }).where(eq(socialAccounts.id, a.id)));
  }
  return queued;
}

export async function listSpaceAccounts(ctx: SpaceContext) {
  return withOrg(ctx.org.id, async (tx) => {
    const accounts = await tx.select().from(socialAccounts).where(eq(socialAccounts.spaceId, ctx.space.id)).orderBy(socialAccounts.platform, socialAccounts.createdAt);
    const log = accounts.length
      ? await tx
          .select()
          .from(activityLog)
          .where(and(eq(activityLog.targetType, "social_account"), inArray(activityLog.targetId, accounts.map((a) => a.id))))
          .orderBy(desc(activityLog.at))
          .limit(12)
      : [];
    return { accounts, log };
  });
}
