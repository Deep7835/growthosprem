// Encryption at rest for platform tokens (PRD 10, Security): AES-256-GCM with a random IV.
// Sealed values look like "v1.<iv>.<tag>.<ciphertext>" in base64url.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64.trim(), "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32).");
  return key;
}

export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function open(sealed: string, key: Buffer): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Not a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

let cached: Buffer | undefined;

/**
 * TOKEN_ENCRYPTION_KEY in production. In development a key is generated once into
 * .data/token.key, so it goes away with the local database (npm run db:reset).
 */
export function tokenKey(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.TOKEN_ENCRYPTION_KEY;
  if (fromEnv) return (cached = parseKey(fromEnv));
  if (process.env.NODE_ENV === "production") throw new Error("Set TOKEN_ENCRYPTION_KEY to store social account tokens.");
  const file = path.join(process.cwd(), ".data", "token.key");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  return (cached = parseKey(readFileSync(file, "utf8")));
}

export const sealToken = (plain: string) => seal(plain, tokenKey());
export const openToken = (sealed: string) => open(sealed, tokenKey());
