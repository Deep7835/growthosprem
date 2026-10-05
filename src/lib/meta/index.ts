import { createFakeGraph } from "./fake";
import { createGraph, type Graph } from "./graph";

export type MetaMode = "live" | "sample" | "unconfigured";

/** "sample" runs the whole connection flow on generated data (development, or META_FAKE=1). */
export function metaMode(): MetaMode {
  if (process.env.META_FAKE === "1") return "sample";
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) return "live";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "sample";
}

const globalForGraph = globalThis as unknown as { __metaGraph?: Graph };

export function getGraph(): Graph | null {
  const mode = metaMode();
  if (mode === "unconfigured") return null;
  globalForGraph.__metaGraph ??=
    mode === "sample" ? createFakeGraph() : createGraph({ appId: process.env.META_APP_ID!, appSecret: process.env.META_APP_SECRET! });
  return globalForGraph.__metaGraph;
}

export { GraphError, type Graph, type PageCandidate } from "./graph";
