/**
 * Runs every static rule and aggregates the findings.
 *
 * Note on scope: deep vulnerability classes (reentrancy, CEI ordering) are left
 * to the AI layer, which reads the whole source. A regex cannot tell a real
 * reentrancy from a guarded one, and a false DANGER costs a user more than a
 * missed nuance.
 */

import type { CheckContext, CheckSummaryItem, Finding, Severity } from "../types";
import { approvalChecks } from "./approvals";
import { honeypotChecks } from "./honeypot";
import { mintableChecks } from "./mintable";
import { ownershipChecks } from "./ownership";

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function runChecks(ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];

  if (isEoa(ctx)) {
    // No code at this address on this chain — nothing to analyse.
    findings.push({
      id: "meta.not_a_contract",
      kind: "context",
      severity: "info",
      humanReason:
        "This address is a wallet, not a contract. There is no code here to check.",
    });
    return findings;
  }

  if (!ctx.verified) {
    // README rule: never return SAFE on a contract we could not read. Say which
    // of the two reasons applies — "not published" is a fact about the contract,
    // "could not check" is a fact about us.
    findings.push(
      ctx.sourceLookupInconclusive
        ? {
            id: "meta.source_unavailable",
            kind: "context",
            severity: "medium",
            humanReason:
              "We could not reach the services that publish contract code, so the code itself was not checked this time.",
          }
        : {
            id: "meta.unverified_source",
            kind: "context",
            severity: "medium",
            humanReason:
              "We could not verify this contract's code with any public source, so nobody can check what it really does.",
          },
    );
  }

  findings.push(
    ...honeypotChecks(ctx),
    ...mintableChecks(ctx),
    ...ownershipChecks(ctx),
    ...approvalChecks(ctx),
  );

  return dedupe(findings).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

export function isEoa(ctx: CheckContext): boolean {
  return !ctx.bytecode || ctx.bytecode === "0x" || ctx.bytecode.length <= 2;
}

export function highestSeverity(findings: Finding[]): Severity | null {
  return findings.reduce<Severity | null>(
    (worst, f) =>
      worst === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst,
    null,
  );
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

export { approvalChecks, honeypotChecks, mintableChecks, ownershipChecks };

/**
 * The "what we found" list.
 *
 * A user needs to see what was checked, not only what failed — a list of four
 * clean lines is what makes the one red line believable. It has three states,
 * not two: a check that could not run because the code was never published is
 * NOT a pass, and saying so is the whole fail-safe principle in miniature.
 *
 * Ownership is the exception that has to be modelled: owner and proxy come off
 * the chain itself, so those questions get answered even for a contract nobody
 * has published source for.
 */
const FAMILIES: { id: string; label: string; needsSource: boolean }[] = [
  { id: "honeypot", label: "Can you sell it back?", needsSource: true },
  { id: "mint", label: "Can they create more?", needsSource: true },
  { id: "ownership", label: "Who can change it?", needsSource: false },
  { id: "approvals", label: "Can it take your tokens?", needsSource: true },
];

const PASS_DETAIL: Record<string, string> = {
  honeypot: "Nothing in the code stops you selling or sending it.",
  mint: "The supply cannot be inflated at will.",
  ownership: "No single wallet holds special powers over it.",
  approvals: "Nothing in it can pull tokens out of your wallet.",
};

const UNCHECKED_DETAIL = "Not checked — the code behind this was never published.";

export function summariseChecks(ctx: CheckContext, findings: Finding[]): CheckSummaryItem[] {
  if (isEoa(ctx)) return [];

  return FAMILIES.map(({ id, label, needsSource }) => {
    const mine = findings.filter((f) => f.id.startsWith(`${id}.`));
    const flags = mine.filter((f) => f.severity !== "info");

    if (flags.length > 0) {
      return { id, label, status: "flag" as const, detail: flags[0].humanReason };
    }
    if (needsSource && !ctx.verified) {
      return { id, label, status: "unchecked" as const, detail: UNCHECKED_DETAIL };
    }
    // An info-severity finding is a positive signal — let it speak for itself.
    return {
      id,
      label,
      status: "pass" as const,
      detail: mine[0]?.humanReason ?? PASS_DETAIL[id],
    };
  });
}
