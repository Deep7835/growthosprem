// The Anthropic client, shared by the web server and the job worker (no Next.js imports).
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null | undefined;

/**
 * Whether credentials are configured: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
 * `ant auth login` profile. The SDK resolves them lazily, so this is checked up front.
 */
export function credentialsConfigured() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) return true;
  return existsSync(path.join(os.homedir(), ".config", "anthropic"));
}

/** The API client, or null when AI isn't set up. */
export function anthropic(): Anthropic | null {
  if (client === undefined) client = credentialsConfigured() ? new Anthropic() : null;
  return client;
}
