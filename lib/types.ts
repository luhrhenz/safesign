/** Shared types for the whole analysis pipeline. */
import type { TokenMatch } from "./tokenSearch";

export type Severity = "high" | "medium" | "low" | "info";

/**
 * What a finding actually establishes — the distinction the verdict turns on.
 *
 * Static analysis can prove what code CAN do. It cannot read intent. The same
 * freeze-and-mint powers are deliberate in USDT and lethal in a rug, and no
 * regex will ever tell the two apart. So a finding says which of these it is,
 * and only "fact" is allowed to condemn:
 *
 *   fact       — true regardless of who runs it: on a scam list, or code that
 *                blocks everyone from selling.
 *   capability — something the owner is able to do. Disclosed, never judged.
 *   context    — neither; background for the reader.
 */
export type FindingKind = "fact" | "capability" | "context";

/** What every static red-flag rule returns (README §6). */
export interface Finding {
  /** Stable machine id, e.g. "honeypot.blacklist_mapping". */
  id: string;
  /** Whether this is proof of harm, or a power someone holds. */
  kind: FindingKind;
  severity: Severity;
  /** Plain language. No jargon — this can end up in front of a user. */
  humanReason: string;
  /** Optional snippet of the source that triggered the rule. */
  evidence?: string;
}

export type Verdict = "SAFE" | "CAUTION" | "DANGER";

export interface VerdictResult {
  verdict: Verdict;
  /** The words at the top of the card. Computed with the verdict, so the
   *  wording is testable and cannot drift out of step with the tier. */
  headline: string;
  /** One plain line under the headline. */
  lede: string;
  /** 2–3 short reasons, plain language. */
  reasons: string[];
  /** One line: what the user should actually do. */
  whatToDo: string;
}

/** One line in the "what we found" list. */
export interface CheckSummaryItem {
  id: string;
  /** A question in the user's words, not a rule name. */
  label: string;
  /** "unchecked" is not a pass — it means the code could not be read. */
  status: "flag" | "pass" | "unchecked";
  detail: string;
}

/**
 * What /api/check returns when it actually checked something.
 * The `status` tag exists so nothing downstream can assume a verdict is there.
 */
export interface CheckResponse extends VerdictResult {
  status: "verdict";
  /** "rules", or "rules+<provider>" when the optional layer reworded them. */
  engine: string;
  /** A scam list or the explorer was unreachable — the check is incomplete. */
  degraded: boolean;
  /** Served from the verdict cache rather than freshly analysed. */
  cached?: boolean;
  /**
   * Provenance and caveats — where the source came from, how good the match
   * was. Never changes severity; it tells the reader how much to trust it.
   */
  notes?: string[];
  subject: {
    kind: "address" | "link";
    address?: string;
    domain?: string;
    chain?: string;
    chainLabel?: string;
    verified?: boolean;
    contractName?: string;
    /** A token most people would recognise. Context only — never a verdict. */
    wellKnown?: boolean;
    /** Which provider supplied the source, when one did. */
    sourceProvider?: string;
    sourceConfidence?: "high" | "medium";
    sourceMatchType?: string;
    explorerUrl?: string;
  };
  findings: Finding[];
  /** The four questions we ask of a contract, and how each came out. */
  checks?: CheckSummaryItem[];
}

export interface CheckContext {
  address: string;
  chain: string;
  /** Did the explorer have verified source for this address? */
  verified: boolean;
  /** Flattened Solidity source. Empty string when unverified. */
  source: string;
  /**
   * True when no source provider could give a clean answer (all errored or
   * were skipped). "We could not check" is a different message from
   * "this contract is not verified".
   */
  sourceLookupInconclusive?: boolean;
  contractName: string;
  abi: AbiFragment[] | null;
  /** Runtime bytecode ("0x" when the address is an EOA). */
  bytecode: string;
  /** Result of calling owner() — null when the contract has no owner(). */
  owner: string | null;
  /** True when owner() points at another contract (multisig/timelock/DAO). */
  ownerIsContract: boolean | null;
  proxy: { isProxy: boolean; implementation: string | null };
}

export interface AbiFragment {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: { name?: string; type?: string }[];
}

/**
 * The fourth UI state, alongside SAFE / CAUTION / DANGER: input we could not
 * identify. It carries no verdict, no subject and no findings, because nothing
 * was checked. Claiming otherwise is the failure this state exists to prevent.
 */
export interface UnrecognizedResponse {
  status: "unrecognized";
  message: string;
  /** A second line telling the user what to try instead, when we know. */
  hint?: string;
}

/**
 * Non-verdict, like UnrecognizedResponse — but instead of a dead end, a set
 * of real candidates for a name that isn't unique. The user picks; that pick
 * becomes an ordinary address check, same pipeline as a pasted address. This
 * state itself carries no safety claim about any of them.
 */
export interface NameMatchesResponse {
  status: "name_matches";
  query: string;
  matches: TokenMatch[];
}

export type CheckApiResponse = CheckResponse | UnrecognizedResponse | NameMatchesResponse;

export function isUnrecognized(
  response: CheckApiResponse,
): response is UnrecognizedResponse {
  return response.status === "unrecognized";
}

/**
 * The single decision the UI makes about the traffic light. Lives here rather
 * than in the component so it is framework-agnostic and directly testable.
 */
export function shouldRenderVerdictCard(response: CheckApiResponse | null): boolean {
  return response !== null && response.status === "verdict";
}
