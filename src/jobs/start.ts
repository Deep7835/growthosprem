// Starts the job worker inside the Next.js server, once per process.
import { getSystemDb } from "@/db/system";
import { getGraph } from "@/lib/meta";
import { startWorker } from "./worker";

const globalForWorker = globalThis as unknown as { __growthWorker?: ReturnType<typeof startWorker> };

/**
 * In development, and whenever JOBS_IN_PROCESS=1. A production deployment with a hosted
 * database runs `npm run worker` as a separate process instead.
 */
export function ensureWorker() {
  const inProcess = process.env.JOBS_IN_PROCESS ? process.env.JOBS_IN_PROCESS === "1" : process.env.NODE_ENV !== "production";
  if (!inProcess || globalForWorker.__growthWorker) return;
  globalForWorker.__growthWorker = startWorker({ getDb: getSystemDb, getGraph, log: (m) => console.log(m) });
}
