/**
 * A cap on how fast one caller can make us do expensive work.
 *
 * /api/check is public and unauthenticated, and each call can fan out into a
 * source lookup and a dozen RPC calls. Without a limit, one script can exhaust
 * a free tier's function budget in minutes and take the tool offline for the
 * people it exists for — and the public RPCs we depend on will throttle us long
 * before that, which looks like "SafeSign is broken" rather than "someone is
 * hammering it".
 *
 * A fixed window in memory, per instance. That is genuinely weaker than a
 * shared counter — a serverless deployment has several instances, so the real
 * ceiling is the limit times the instance count — but it needs no dependency
 * and no round trip, and it turns "unbounded" into "bounded", which is the
 * whole point. The KV counter is the upgrade path when there is traffic worth
 * counting that precisely.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

/** Keeps a long-lived instance from growing without bound. */
const MAX_TRACKED = 5_000;

const hits = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
  remaining: number;
}

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    if (hits.size >= MAX_TRACKED) evictExpired(now);
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0, remaining: MAX_PER_WINDOW - 1 };
  }

  entry.count++;
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

  return entry.count > MAX_PER_WINDOW
    ? { allowed: false, retryAfter, remaining: 0 }
    : { allowed: true, retryAfter, remaining: MAX_PER_WINDOW - entry.count };
}

/**
 * Who is calling. Behind a proxy the first x-forwarded-for entry is the client;
 * everything else is infrastructure. Falls back to a single shared bucket,
 * which is deliberately strict: if we cannot tell callers apart, we would
 * rather slow everyone a little than let one caller hide.
 */
export function callerKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "anonymous";
}

function evictExpired(now: number): void {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
  // Still full of live entries: drop the oldest rather than grow forever.
  if (hits.size >= MAX_TRACKED) {
    const oldest = hits.keys().next().value;
    if (oldest) hits.delete(oldest);
  }
}

/** Test seam. */
export function resetRateLimit(): void {
  hits.clear();
}
