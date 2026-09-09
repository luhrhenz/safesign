/**
 * Verdict cache, keyed by address+chain (README §8.2).
 *
 * Scam inputs cluster hard: thousands of people paste the same viral token in
 * the same week. Analyse once, serve everyone after from the cache.
 *
 * Backend is an Upstash-style REST KV (Vercel KV speaks the same protocol) when
 * the env vars are set, otherwise an in-process map that survives as long as the
 * serverless instance does. Both are optional: a cache failure must never fail a
 * check, so every path here swallows its errors and returns null.
 */

import type { CheckResponse } from "./types";

const TTL_SECONDS = 6 * 60 * 60;

/** Bump when the shape of a cached verdict changes, to retire old entries. */
const SCHEMA_VERSION = "v1";

const memory = new Map<string, { value: unknown; expiresAt: number }>();
/** Keeps a warm instance from growing without bound. */
const MEMORY_MAX_ENTRIES = 500;

/** Whether an address is a trading pair never changes, so it caches well. */
export function pairCacheKey(chain: string, address: string): string {
  return `safesign:${SCHEMA_VERSION}:pair:${chain}:${address}`;
}

export function cacheKey(parts: { chain?: string; address?: string; domain?: string }): string {
  return parts.address
    ? `safesign:${SCHEMA_VERSION}:${parts.chain ?? "unknown"}:${parts.address}`
    : `safesign:${SCHEMA_VERSION}:link:${parts.domain}`;
}

export async function getCached<T = CheckResponse>(key: string): Promise<T | null> {
  const local = memory.get(key);
  if (local) {
    if (local.expiresAt > Date.now()) return local.value as T;
    memory.delete(key);
  }

  const rest = restConfig();
  if (!rest) return null;

  try {
    const res = await fetch(`${rest.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${rest.token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (typeof data?.result !== "string") return null;

    const value = JSON.parse(data.result) as T;
    rememberLocally(key, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * `ttlSeconds: null` stores the value with no expiry.
 *
 * A verdict should go stale — the contract behind it can change. A running
 * total should not: usage counters written with the verdict TTL would quietly
 * reset themselves after six idle hours, which is worse than not counting at
 * all, because the number would look real.
 */
export async function setCached<T = CheckResponse>(
  key: string,
  value: T,
  ttlSeconds: number | null = TTL_SECONDS,
): Promise<void> {
  rememberLocally(key, value, ttlSeconds);

  const rest = restConfig();
  if (!rest) return;

  const command =
    ttlSeconds === null
      ? ["SET", key, JSON.stringify(value)]
      : ["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)];

  try {
    await fetch(rest.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rest.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // A cache write is never worth failing a check over.
  }
}

/**
 * Do not cache a verdict we already know is incomplete: if a scam list was
 * unreachable, a later request deserves a fresh attempt rather than six hours
 * of the same blind spot.
 */
export function isCacheable(response: CheckResponse): boolean {
  return !response.findings.some((f) => f.id === "meta.source_unavailable") && !response.degraded;
}

function rememberLocally(key: string, value: unknown, ttlSeconds: number | null = TTL_SECONDS): void {
  if (memory.size >= MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  memory.set(key, {
    value,
    expiresAt: ttlSeconds === null ? Number.POSITIVE_INFINITY : Date.now() + ttlSeconds * 1000,
  });
}

function restConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}
