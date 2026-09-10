/**
 * Usage counting, the cheap way.
 *
 * One structured line per check, written to the server log. On Vercel these are
 * searchable in the Logs tab and can be piped to a drain later. No database, no
 * client-side tracker, no third-party script on a slow phone — and enough to
 * answer "how many checks, of what, with what result" for a grant application.
 *
 * Nothing here identifies a person: an address is public data, and no IP,
 * wallet or session id is recorded.
 */

import { getCached, setCached } from "./cache";
import type { Verdict } from "./types";

/**
 * Durable counters, so "how many people used it" survives a restart.
 *
 * The log line below is fine for debugging and useless for a grant application:
 * platform logs roll off, and a number nobody can retrieve is not evidence. The
 * counters live in the same KV as the verdict cache, under one document, and
 * they are the source of truth for usage.
 *
 * Still nothing that identifies a person. Totals only -- no addresses, no IPs,
 * no sessions. Distinct addresses are counted by keeping a bounded set of the
 * ones already seen, which is public data either way.
 */
const COUNTER_KEY = "safesign:v1:counters";
const DISTINCT_CAP = 5_000;

export interface Counters {
  checks: number;
  verdicts: Record<Verdict, number>;
  rejections: number;
  miniPayChecks: number;
  /**
   * Checks per chain. A Celo programme asks what you have done on Celo, and
   * "contracts analysed on Celo" is the honest answer for a read-only tool.
   */
  chains: Record<string, number>;
  distinctAddresses: number;
  /** Bounded -- once full, distinctAddresses stops growing and says so. */
  seen: string[];
  seenCapped: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Built fresh every call, deliberately.
 *
 * A shared constant spread with `{...EMPTY}` copies the nested `verdicts`
 * object and `seen` array by REFERENCE, so the first increment mutates the
 * default and every later "empty" read inherits it. A test caught exactly that.
 */
function emptyCounters(): Counters {
  return {
    checks: 0,
    verdicts: { SAFE: 0, CAUTION: 0, DANGER: 0 },
    rejections: 0,
    miniPayChecks: 0,
    chains: {},
    distinctAddresses: 0,
    seen: [],
    seenCapped: false,
    firstSeenAt: "",
    lastSeenAt: "",
  };
}

export async function readCounters(): Promise<Counters> {
  const stored = await getCached<Counters>(COUNTER_KEY);
  const base = emptyCounters();

  if (!stored) return base;

  // Every nested value is copied. A spread alone shares the nested objects
  // with the cache, so a caller's "snapshot" would be a live view of it and a
  // caller's mutation would silently rewrite the stored totals. `chains` was
  // added without this and the per-chain test caught it immediately.
  return {
    ...base,
    ...stored,
    verdicts: { ...base.verdicts, ...stored.verdicts },
    chains: { ...(stored.chains ?? {}) },
    seen: [...(stored.seen ?? [])],
  };
}

/**
 * Serialises read-add-write, because it is a read-add-write.
 *
 * The first version fired these off in parallel and lost updates: two checks
 * landing together both read the same total, both wrote total+1, and one
 * disappeared. A counter that under-reports is worse than no counter when the
 * whole point is showing a funder real usage. Chaining every bump onto the last
 * makes it exact within an instance.
 *
 * Across instances it is still read-modify-write against shared storage, so a
 * busy multi-instance deployment can drop the occasional increment. The log
 * line remains the exact record if a number is ever disputed.
 */
let queue: Promise<void> = Promise.resolve();

function bump(change: (c: Counters) => void): Promise<void> {
  queue = queue.then(async () => {
    try {
      const counters = await readCounters();
      change(counters);

      const now = new Date().toISOString();
      counters.firstSeenAt ||= now;
      counters.lastSeenAt = now;

      // No expiry: a running total that resets itself is worse than none.
      await setCached<Counters>(COUNTER_KEY, counters, null);
    } catch {
      // Counting is never worth failing a safety check over.
    }
  });

  return queue;
}

/** Test seam: resolves once every queued count has been written. */
export function countersSettled(): Promise<void> {
  return queue;
}

export interface CheckEvent {
  kind: "address" | "link";
  chain?: string;
  verdict: Verdict;
  /** "rules", or "rules+llm" when the optional layer reworded the output. */
  engine: string;
  verified?: boolean;
  findingCount: number;
  /** Served from the verdict cache. */
  cached: boolean;
  /** Was the check made from inside the MiniPay in-app browser? */
  miniPay: boolean;
  durationMs: number;
}

/**
 * Returns the write, so a serverless caller can keep the instance alive until
 * it lands. Fire-and-forget loses the count: the runtime is entitled to freeze
 * the function the moment the response is sent, and an unawaited promise dies
 * with it. That is why the deployed counters read zero after real traffic.
 */
export function recordCheck(event: CheckEvent & { address?: string }): Promise<void> {
  console.log(JSON.stringify({ event: "safesign.check", ...event }));

  return bump((c) => {
    c.checks++;
    c.verdicts[event.verdict] = (c.verdicts[event.verdict] ?? 0) + 1;
    if (event.chain) {
      c.chains = c.chains ?? {};
      c.chains[event.chain] = (c.chains[event.chain] ?? 0) + 1;
    }
    if (event.miniPay) c.miniPayChecks++;

    const address = event.address?.toLowerCase();
    if (!address || c.seen.includes(address)) return;

    if (c.seen.length >= DISTINCT_CAP) {
      c.seenCapped = true;
      return;
    }
    c.seen.push(address);
    c.distinctAddresses = c.seen.length;
  });
}

/**
 * Input we could not identify. Counted separately from checks, because it is
 * not a check — and knowing how often people paste a non-EVM address is worth
 * knowing before deciding what to support next.
 */
export type RejectionReason = "stellar" | "generic" | "unresolved_link" | "unsupported_chain";

export function recordRejection(reason: RejectionReason): Promise<void> {
  console.log(JSON.stringify({ event: "safesign.rejected", reason }));
  return bump((c) => {
    c.rejections++;
  });
}

/** Whether counts are durable, or living in one instance's memory. */
export function storageMode(): "redis" | "memory" {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? "redis" : "memory";
}
