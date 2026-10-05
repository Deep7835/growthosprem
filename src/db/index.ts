import "server-only";
import path from "node:path";
import { createPgliteDb, createPostgresDb, withOrg as withOrgOn, type Db, type Tx } from "./core";
import { seedIfEmpty } from "./seed";
import { seedDemoHistoryIfMissing } from "./seed-history";
import { seedDemoMediaIfMissing } from "./seed-media";
import { getStorage } from "@/storage";

export type { Db, Tx };

const globalForDb = globalThis as unknown as { __growthDb?: Promise<Db> };

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return createPostgresDb(url);
  // Zero-setup local development: a real Postgres running in-process, stored in .data/.
  const db = await createPgliteDb(path.join(process.cwd(), ".data", "pglite"));
  await seedIfEmpty(db);
  await seedDemoHistoryIfMissing(db);
  await seedDemoMediaIfMissing(db, getStorage());
  return db;
}

/**
 * Privileged connection. It bypasses tenant isolation, so use it only for
 * resolving which organisation a request belongs to (src/server/tenancy.ts,
 * share-link lookup). Everything else goes through withOrg().
 */
export function getSystemDb(): Promise<Db> {
  globalForDb.__growthDb ??= init().catch((error) => {
    // Let the next request retry instead of caching the failure.
    globalForDb.__growthDb = undefined;
    throw error;
  });
  return globalForDb.__growthDb;
}

export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withOrgOn(await getSystemDb(), orgId, fn);
}
