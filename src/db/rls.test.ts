import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, withOrg, type Db } from "./core";
import * as s from "./schema";
import { seed } from "./seed";

let db: Db;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  db = await createPgliteDb();
  await seed(db);
  orgA = (await db.select().from(s.organizations))[0].id;
  const [other] = await db.insert(s.organizations).values({ slug: "other-agency", name: "Other agency" }).returning();
  orgB = other.id;
  await db.insert(s.spaces).values({ orgId: orgB, slug: "secret", name: "Secret client" });
}, 30_000);

describe("tenant isolation", () => {
  it("only returns the current organisation's rows", async () => {
    const names = await withOrg(db, orgA, (tx) => tx.select({ name: s.spaces.name }).from(s.spaces));
    expect(names.map((r) => r.name).sort()).toEqual(["Cafe", "Real estate"]);

    const other = await withOrg(db, orgB, (tx) => tx.select({ name: s.spaces.name }).from(s.spaces));
    expect(other.map((r) => r.name)).toEqual(["Secret client"]);
  });

  it("returns nothing even when the query filters on another org's id", async () => {
    const rows = await withOrg(db, orgA, (tx) => tx.select().from(s.spaces).where(eq(s.spaces.orgId, orgB)));
    expect(rows).toEqual([]);
  });

  it("refuses to write a row into another organisation", async () => {
    await expect(
      withOrg(db, orgA, (tx) => tx.insert(s.spaces).values({ orgId: orgB, slug: "sneaky", name: "Sneaky" })),
    ).rejects.toThrow();
  });

  it("protects every table that has an org_id column", async () => {
    const result = await db.execute(sql`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r'
        and exists (select 1 from information_schema.columns col
                    where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'org_id')
    `);
    const rows = (result as unknown as { rows: { table: string; enabled: boolean; forced: boolean }[] }).rows;
    expect(rows.length).toBeGreaterThan(10);
    const unprotected = rows.filter((r) => !r.enabled || !r.forced).map((r) => r.table);
    expect(unprotected).toEqual([]);
  });
});
