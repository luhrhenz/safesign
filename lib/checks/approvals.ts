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
      severity: "high",
      humanReason:
        "This contract can pull tokens out of many wallets in a single transaction. That is how drainers empty wallets once you have approved them.",
      evidence: snippet(source, BATCH_TRANSFER_FROM),
    });
  }

  if (SET_APPROVAL_FOR_ALL.test(source)) {
    findings.push({
      id: "approvals.set_approval_for_all",
      severity: "high",
      humanReason:
        "This contract asks for permission over all of your NFTs from a collection at once, not just the one you are dealing with.",
      evidence: snippet(source, SET_APPROVAL_FOR_ALL),
    });
  }

  if (PERMIT_THEN_PULL.test(source) && /transferFrom\s*\(/.test(source)) {
    findings.push({
      id: "approvals.permit_forwarding",
      severity: "high",
      humanReason:
        "This contract uses a signature to take tokens from your wallet. A signature like that can move your funds even though it does not look like a payment.",
      evidence: snippet(source, PERMIT_THEN_PULL),
    });
  }

  if (ARBITRARY_CALL.test(source)) {
    findings.push({
      id: "approvals.arbitrary_call",
      severity: "high",
      humanReason:
        "This contract can be told to run any instruction the caller chooses. Whatever it is allowed to touch, that instruction can touch too.",
      evidence: snippet(source, ARBITRARY_CALL),
    });
  }

  if (UNLIMITED_APPROVAL.test(source)) {
    findings.push({
      id: "approvals.unlimited_approval",
      severity: "medium",
      humanReason:
        "This contract works with unlimited spending permission. If it is ever compromised, everything you approved can be taken.",
      evidence: snippet(source, UNLIMITED_APPROVAL),
    });
  }

  return findings;
}
