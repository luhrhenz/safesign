/**
 * Honeypot / rug patterns — "can I buy this and then not sell it?"
 * These are the checks a generic tool gets wrong, so they are deliberately
 * specific about what the owner is able to do to a holder.
 */

import type { CheckContext, Finding } from "../types";
import { snippet, stripComments } from "./util";

const BLACKLIST_MAPPING =
  /mapping\s*\(\s*address\s*=>\s*bool\s*\)\s*(?:public|private|internal)?\s*_?(?:blacklist|blacklisted|isBlacklisted|blocked|isBlocked|bots?|isBot|banned)/i;

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

  if (BLACKLIST_MAPPING.test(source)) {
    findings.push({
      id: "honeypot.blacklist_mapping",
      severity: "high",
      humanReason:
        "The owner keeps a list of wallets that are blocked. Your wallet can be added to it, and then you would not be able to move or sell this token.",
      evidence: snippet(source, BLACKLIST_MAPPING),
    });
  }

  if (TRADING_SWITCH.test(source)) {
    findings.push({
      id: "honeypot.trading_switch",
      severity: "high",
      humanReason:
        "Trading in this token can be turned on and off by the owner. If it is turned off, you cannot sell until they turn it back on.",
      evidence: snippet(source, TRADING_SWITCH),
    });
  }

  if (TRANSFER_GUARD.test(source)) {
    findings.push({
      id: "honeypot.transfer_restriction",
      severity: "high",
      humanReason:
        "Sending this token is only allowed under certain conditions set by the owner. That is how tokens you can buy but cannot sell are built.",
      evidence: snippet(source, TRANSFER_GUARD),
    });
  }

  if (FEE_SETTER.test(source)) {
    const capped = FEE_CAP.test(source);
    findings.push({
      id: "honeypot.mutable_fees",
      severity: capped ? "medium" : "high",
      humanReason: capped
        ? "The owner can change the fee taken on each trade, though the code puts a limit on how high it can go."
        : "The owner can change the fee taken when you trade, with no limit in the code. Some scam tokens raise it close to 100%, so a sale returns almost nothing.",
      evidence: snippet(source, FEE_SETTER),
    });
  }

  if (MAX_LIMITS.test(source)) {
    findings.push({
      id: "honeypot.transfer_limits",
      severity: "medium",
      humanReason:
        "There are limits on how much of this token can be moved or held at once, and the owner can change them.",
      evidence: snippet(source, MAX_LIMITS),
    });
  }

  return findings;
}
