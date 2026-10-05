// Applies drizzle/ migrations to a hosted Postgres (DATABASE_URL). Local PGlite migrates itself on start.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the Postgres you want to migrate.");
  process.exit(1);
}
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Migrations applied.");
