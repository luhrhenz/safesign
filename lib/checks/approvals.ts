/**
 * Drainer / approval-phishing patterns — "is it safe to sign for this?"
 * A drainer does not need a bad token: it needs your approval and a sweep
 * function. These rules look for the sweep side of that trade.
 */

import type { CheckContext, Finding } from "../types";
import { snippet, stripComments } from "./util";

const UNLIMITED_APPROVAL =
  /approve\s*\([^)]{0,80}(?:type\s*\(\s*uint256\s*\)\s*\.\s*max|0xf{20,}|uint256\(-1\))/i;

const SET_APPROVAL_FOR_ALL = /\.\s*setApprovalForAll\s*\(/;

/** transferFrom inside a loop: pulls tokens from many wallets in one call. */
const BATCH_TRANSFER_FROM =
  /for\s*\([^)]*\)\s*\{[^}]{0,400}\.\s*(?:transferFrom|safeTransferFrom)\s*\(/;

const PERMIT_THEN_PULL = /\.\s*permit\s*\(/;

/** A call whose target and calldata both come from the caller. */
const ARBITRARY_CALL =
  /\.\s*(?:delegatecall|call)\s*(?:\{[^}]*\})?\s*\(\s*(?:_?data|_?payload|calldata\w*)/i;

export function approvalChecks(ctx: CheckContext): Finding[] {
  if (!ctx.verified) return [];

  const source = stripComments(ctx.source);
  const findings: Finding[] = [];

  if (BATCH_TRANSFER_FROM.test(source)) {
    findings.push({
      id: "approvals.batch_transfer_from",
      kind: "capability",
      severity: "medium",
      humanReason:
        "This contract can pull tokens out of many wallets in one go. Airdrop and payment tools do this legitimately; so do drainers, once you approve them.",
      evidence: snippet(source, BATCH_TRANSFER_FROM),
    });
  }

  if (SET_APPROVAL_FOR_ALL.test(source)) {
    findings.push({
      id: "approvals.set_approval_for_all",
      kind: "capability",
      severity: "medium",
      humanReason:
        "This asks for permission over every NFT in a collection at once, not just the one you are dealing with. Marketplaces need this; a page you do not recognise should not.",
      evidence: snippet(source, SET_APPROVAL_FOR_ALL),
    });
  }

  if (PERMIT_THEN_PULL.test(source) && /transferFrom\s*\(/.test(source)) {
    findings.push({
      id: "approvals.permit_forwarding",
      kind: "capability",
      severity: "medium",
      humanReason:
        "This uses a signature to move tokens out of your wallet. A signature like that does not look like a payment, but it can act like one.",
      evidence: snippet(source, PERMIT_THEN_PULL),
    });
  }

  if (ARBITRARY_CALL.test(source)) {
    findings.push({
      id: "approvals.arbitrary_call",
      kind: "capability",
      severity: "medium",
      humanReason:
        "This contract can be told to run any instruction the caller chooses. Routers work this way by design; it also means it can reach whatever it is allowed to touch.",
      evidence: snippet(source, ARBITRARY_CALL),
    });
  }

  if (UNLIMITED_APPROVAL.test(source)) {
    findings.push({
      id: "approvals.unlimited_approval",
      kind: "capability",
      severity: "low",
      humanReason:
        "This works with unlimited spending permission. Convenient, and it means everything you approved is exposed if it is ever compromised.",
      evidence: snippet(source, UNLIMITED_APPROVAL),
    });
  }

  return findings;
}
