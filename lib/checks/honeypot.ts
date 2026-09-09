/**
 * Can you get your money back out?
 *
 * Two different questions live here, and the difference is the whole verdict:
 *
 *   1. Does the code stop EVERYONE from selling? That is a fact about the
 *      token, true no matter who deployed it — a honeypot.
 *   2. Can the OWNER stop you selling? That is a power someone holds. USDT's
 *      owner can freeze any wallet, and USDT is not a scam. Disclosed, not
 *      judged.
 *
 * Only the first can produce DANGER.
 */

import type { CheckContext, Finding } from "../types";
import { snippet, stripComments } from "./util";

/* --- 1. facts: nobody can sell ------------------------------------------- */

/** A transfer that only the owner may ever make. Holders cannot move it at all. */
const OWNER_ONLY_TRANSFER =
  /function\s+_?transfer[^{]{0,120}\{[^}]{0,400}require\s*\([^;]{0,140}==\s*(?:owner|_owner|owner\(\))/i;

/** A sell fee fixed at (or near) 100% in the code — a sale returns nothing. */
const TOTAL_SELL_FEE =
  /\b(?:_?sell(?:Fee|Tax)|taxForSelling|sellTaxRate)\s*=\s*(?:9[5-9]|100)\b/i;

/* --- 2. capabilities: what the owner can do ------------------------------ */

const BLACKLIST_MAPPING =
  /mapping\s*\(\s*address\s*=>\s*bool\s*\)\s*(?:public|private|internal)?\s*_?(?:blacklist|blacklisted|isBlacklisted|blocked|isBlocked|bots?|isBot|banned|frozen|isFrozen)/i;

const TRADING_SWITCH =
  /function\s+(?:enableTrading|setTradingEnabled|openTrading|setTrading|startTrading|setSwapEnabled|setCanTrade)\s*\(/i;

const TRANSFER_GUARD =
  /(?:require|revert)[^;]{0,200}(?:tradingEnabled|tradingOpen|canTrade|isWhitelisted|whitelist|blacklist|blocked|isBot|_isExcluded)/i;

const FEE_SETTER =
  /function\s+(?:set|update|change)(?:Buy|Sell|Total|Marketing|Liquidity)?(?:Fee|Fees|Tax|Taxes|TaxRate|FeePercent)\s*\(/i;

/** A hard cap on the fee the owner can set — the mitigation we look for. */
const FEE_CAP = /require\s*\([^;]{0,160}(?:fee|tax)[^;]{0,160}<=?\s*\d+/i;

const MAX_LIMITS =
  /\b(?:maxTxAmount|maxTransactionAmount|maxSellAmount|maxWalletAmount|maxWallet|_maxTx)\b/i;

export function honeypotChecks(ctx: CheckContext): Finding[] {
  if (!ctx.verified) return [];

  const source = stripComments(ctx.source);
  const findings: Finding[] = [];

  // ---- facts ----
  if (OWNER_ONLY_TRANSFER.test(source)) {
    findings.push({
      id: "honeypot.transfers_owner_only",
      kind: "fact",
      severity: "high",
      humanReason:
        "Only the creator can move this token. If you buy it, you cannot send or sell it — your money stays in.",
      evidence: snippet(source, OWNER_ONLY_TRANSFER),
    });
  }

  if (TOTAL_SELL_FEE.test(source)) {
    findings.push({
      id: "honeypot.total_sell_fee",
      kind: "fact",
      severity: "high",
      humanReason:
        "The fee on selling is set to almost everything you would get back. Selling returns you close to nothing.",
      evidence: snippet(source, TOTAL_SELL_FEE),
    });
  }

  // ---- capabilities ----
  if (BLACKLIST_MAPPING.test(source)) {
    findings.push({
      id: "honeypot.blacklist_mapping",
      kind: "capability",
      severity: "medium",
      humanReason:
        "The owner can freeze this token in any wallet, including yours. Big stablecoins do this on purpose to stop theft; an unknown project doing it is a risk.",
      evidence: snippet(source, BLACKLIST_MAPPING),
    });
  }

  if (TRADING_SWITCH.test(source)) {
    findings.push({
      id: "honeypot.trading_switch",
      kind: "capability",
      severity: "medium",
      humanReason:
        "The owner can switch trading off. While it is off, nobody can sell. It depends entirely on whether you trust them to leave it on.",
      evidence: snippet(source, TRADING_SWITCH),
    });
  }

  if (TRANSFER_GUARD.test(source)) {
    findings.push({
      id: "honeypot.transfer_restriction",
      kind: "capability",
      severity: "medium",
      humanReason:
        "Sending this token is only allowed under conditions the owner sets. Some projects use this at launch; others use it to trap buyers.",
      evidence: snippet(source, TRANSFER_GUARD),
    });
  }

  if (FEE_SETTER.test(source)) {
    const capped = FEE_CAP.test(source);
    findings.push({
      id: "honeypot.mutable_fees",
      kind: "capability",
      severity: capped ? "low" : "medium",
      humanReason: capped
        ? "The owner can change the fee you pay on each trade, though the code limits how high it can go."
        : "The owner can change the fee you pay when you trade, with no limit written into the code. Honest projects use small fees; some raise it so a sale returns almost nothing.",
      evidence: snippet(source, FEE_SETTER),
    });
  }

  if (MAX_LIMITS.test(source)) {
    findings.push({
      id: "honeypot.transfer_limits",
      kind: "capability",
      severity: "low",
      humanReason:
        "There is a limit on how much can be moved or held at once, and the owner can change it. Common at launch, awkward if you hold a lot.",
      evidence: snippet(source, MAX_LIMITS),
    });
  }

  return findings;
}
