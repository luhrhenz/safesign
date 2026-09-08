/** Supply inflation — "can they print more of this while I hold it?" */

import type { CheckContext, Finding } from "../types";
import { snippet, stripComments } from "./util";

const MINT_FUNCTION = /function\s+(?:_?mint|mintTo|issue|createTokens)\s*\(/i;
const SUPPLY_CAP = /\b(?:maxSupply|MAX_SUPPLY|cap\(\)|_cap\b|supplyCap|hardCap)\b/;

export function mintableChecks(ctx: CheckContext): Finding[] {
  const findings: Finding[] = [];
  const source = ctx.verified ? stripComments(ctx.source) : "";

  const inSource = MINT_FUNCTION.test(source);
  const inAbi = (ctx.abi ?? []).some(
    (item) =>
      item.type === "function" &&
      /^(?:mint|mintTo|issue)$/i.test(item.name ?? "") &&
      item.stateMutability !== "view" &&
      item.stateMutability !== "pure",
  );

  if (!inSource && !inAbi) return findings;

  const capped = SUPPLY_CAP.test(source);
  findings.push({
    id: capped ? "mint.capped" : "mint.unlimited",
    severity: capped ? "low" : "high",
    humanReason: capped
      ? "New tokens can still be created, but the code sets a maximum total supply."
      : "New tokens can be created at any time with no limit in the code. That can push the value of the ones you hold towards zero.",
    evidence: inSource
      ? snippet(source, MINT_FUNCTION)
      : "mint function present in the contract ABI",
  });

  return findings;
}
