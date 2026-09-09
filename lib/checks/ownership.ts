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
      kind: "capability",
      severity: eoaOwner ? "medium" : "low",
      humanReason: eoaOwner
        ? "The code can be changed later, and one personal wallet can do it alone. What is safe today might not stay that way."
        : "The code can be changed later, so what is safe now might not stay that way. Most large projects work like this, with several people needed to approve a change.",
      evidence: ctx.proxy.implementation
        ? `current code lives at ${ctx.proxy.implementation}`
        : undefined,
    });
  }

  if (ctx.owner) {
    if (ctx.ownerIsContract) {
      findings.push({
        id: "ownership.owner_is_contract",
        kind: "context",
        severity: "info",
        humanReason:
          "The owner is another contract, which usually means a shared wallet or a delay is required before changes take effect.",
        evidence: `owner: ${ctx.owner}`,
      });
    } else {
      findings.push({
        id: "ownership.not_renounced",
        kind: "capability",
        severity: "low",
        humanReason:
          "One personal wallet still controls this contract and holds whatever owner powers it has. That is normal for a running project and a risk with an anonymous one.",
        evidence: `owner: ${ctx.owner}`,
      });
    }
  }

  if (PAUSABLE.test(source)) {
    findings.push({
      id: "ownership.pausable",
      kind: "capability",
      severity: "medium",
      humanReason:
        "The owner can pause this token, which stops everyone moving it until they turn it back on. Used to contain hacks; also used to trap holders.",
      evidence: snippet(source, PAUSABLE),
    });
  }

  if (SELFDESTRUCT.test(source)) {
    findings.push({
      id: "ownership.selfdestruct",
      kind: "capability",
      severity: "medium",
      humanReason:
        "The contract can be destroyed by whoever controls it. Anything left inside would be lost.",
      evidence: snippet(source, SELFDESTRUCT),
    });
  }

  return findings;
}
