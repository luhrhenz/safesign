/**
 * Who is in control — ownership, pause powers, and upgradeable code.
 * These rules lean on on-chain facts (owner(), the EIP-1967 slot) rather than
 * source patterns, so they still work on a contract with no verified source.
 */

import type { CheckContext, Finding } from "../types";
import { snippet, stripComments } from "./util";

const PAUSABLE = /(?:function\s+pause\s*\(|whenNotPaused|contract\s+\w*Pausable)/;
const SELFDESTRUCT = /\bselfdestruct\s*\(|\bsuicide\s*\(/;

export function ownershipChecks(ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  const source = ctx.verified ? stripComments(ctx.source) : "";

  if (ctx.proxy.isProxy) {
    // An upgradeable contract controlled by one personal wallet is the classic
    // rug setup: today's code is not necessarily tomorrow's code.
    const eoaOwner = ctx.owner !== null && ctx.ownerIsContract === false;
    findings.push({
      id: eoaOwner ? "ownership.upgradeable_eoa_owner" : "ownership.upgradeable",
      severity: eoaOwner ? "high" : "medium",
      humanReason: eoaOwner
        ? "This contract can be replaced with completely different code, and a single personal wallet is able to do it. What you check today may not be what runs tomorrow."
        : "This contract can be upgraded, so the code behind it can change later.",
      evidence: ctx.proxy.implementation
        ? `current code lives at ${ctx.proxy.implementation}`
        : undefined,
    });
  }

  if (ctx.owner) {
    if (ctx.ownerIsContract) {
      findings.push({
        id: "ownership.owner_is_contract",
        severity: "info",
        humanReason:
          "The owner is another contract, which usually means a shared wallet or a delay is required before changes take effect.",
        evidence: `owner: ${ctx.owner}`,
      });
    } else {
      findings.push({
        id: "ownership.not_renounced",
        severity: "medium",
        humanReason:
          "One personal wallet still controls this contract and can use the owner-only powers in it.",
        evidence: `owner: ${ctx.owner}`,
      });
    }
  }

  if (PAUSABLE.test(source)) {
    findings.push({
      id: "ownership.pausable",
      severity: "medium",
      humanReason:
        "The owner can pause this contract, which stops transfers for everyone until they unpause it.",
      evidence: snippet(source, PAUSABLE),
    });
  }

  if (SELFDESTRUCT.test(source)) {
    findings.push({
      id: "ownership.selfdestruct",
      severity: "high",
      humanReason:
        "The contract contains code that can destroy itself. Funds left in it could be lost.",
      evidence: snippet(source, SELFDESTRUCT),
    });
  }

  return findings;
}
