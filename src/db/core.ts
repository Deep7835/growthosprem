// Database factories and tenant scoping, free of Next.js imports so tests and
// scripts can use them directly.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** In-process Postgres for local development and tests. `dataDir` undefined = in memory. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as Db;
}

/** Hosted Postgres (Supabase, Neon, RDS). Migrations run separately: `npm run db:migrate`. */
export function createPostgresDb(url: string): Db {
  const client = postgres(url, { prepare: false });
  return drizzlePostgres(client, { schema }) as unknown as Db;
}

/**
 * Runs `fn` in a transaction that can only see and write rows of `orgId`.
 * Postgres enforces this through the policies in drizzle/0001_rls.sql, so a
 * missing WHERE clause in application code cannot leak another tenant's data.
 */
export async function withOrg<T>(db: Db, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    await tx.execute(sql`set local role app_user`);
    return fn(tx);
  });
}
