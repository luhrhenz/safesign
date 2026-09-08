/**
 * Runs every static rule and aggregates the findings.
 *
 * Note on scope: deep vulnerability classes (reentrancy, CEI ordering) are left
 * to the AI layer, which reads the whole source. A regex cannot tell a real
 * reentrancy from a guarded one, and a false DANGER costs a user more than a
 * missed nuance.
 */

import type { CheckContext, Finding, Severity } from "../types";
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
            severity: "medium",
            humanReason:
              "We could not reach the services that publish contract code, so the code itself was not checked this time.",
          }
        : {
            id: "meta.unverified_source",
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
