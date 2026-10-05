// The job worker as its own process, for production: npm run worker
// Needs DATABASE_URL (the in-process development database can only be opened by one process).
import { createPostgresDb } from "../src/db/core";
import { getGraph } from "../src/lib/meta";
import { startWorker } from "../src/jobs/worker";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL. In development the worker runs inside `npm run dev` instead.");
  process.exit(1);
}
const db = createPostgresDb(url);
const worker = startWorker({ getDb: async () => db, getGraph, log: (m) => console.log(m) });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`[jobs] ${signal}: finishing the current job…`);
    await worker.stop();
    process.exit(0);
  });
}
