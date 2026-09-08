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

import type { Verdict } from "./types";

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

export function recordCheck(event: CheckEvent): void {
  console.log(JSON.stringify({ event: "safesign.check", ...event }));
}
