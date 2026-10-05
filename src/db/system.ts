// The privileged database connection, without Next.js imports so the job worker can share
// it. App code imports it through src/db/index.ts.
import path from "node:path";
import { createPgliteDb, createPostgresDb, type Db } from "./core";
import { seedIfEmpty } from "./seed";
import { seedDemoHistoryIfMissing } from "./seed-history";
import { seedDemoMediaIfMissing } from "./seed-media";
import { getStorage } from "@/storage";

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
 * share-link lookup) and for the job worker. Everything else goes through withOrg().
 */
export function getSystemDb(): Promise<Db> {
  globalForDb.__growthDb ??= init().catch((error) => {
    // Let the next request retry instead of caching the failure.
    globalForDb.__growthDb = undefined;
    throw error;
  });
  return globalForDb.__growthDb;
}
