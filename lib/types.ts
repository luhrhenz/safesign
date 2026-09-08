/** Shared types for the whole analysis pipeline. */

export type Severity = "high" | "medium" | "low" | "info";

/** What every static red-flag rule returns (README §6). */
export interface Finding {
  /** Stable machine id, e.g. "honeypot.blacklist_mapping". */
  id: string;
  severity: Severity;
  /** Plain language. No jargon — this can end up in front of a user. */
  humanReason: string;
  /** Optional snippet of the source that triggered the rule. */
  evidence?: string;
}

export type Verdict = "SAFE" | "CAUTION" | "DANGER";

export interface VerdictResult {
  verdict: Verdict;
  /** 2–3 short reasons, plain language. */
  reasons: string[];
  /** One line: what the user should actually do. */
  whatToDo: string;
}

/** What /api/check returns, and what the UI renders. */
export interface CheckResponse extends VerdictResult {
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
    /** Which provider supplied the source, when one did. */
    sourceProvider?: string;
    sourceConfidence?: "high" | "medium";
    sourceMatchType?: string;
    explorerUrl?: string;
  };
  findings: Finding[];
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
