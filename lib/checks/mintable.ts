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
    // A mint function is a power, not a crime. Stablecoins mint every day.
    kind: "capability",
    severity: capped ? "low" : "medium",
    humanReason: capped
      ? "The creator can make new tokens, up to a maximum the code sets. Whether that matters depends on who they are."
      : "The creator can make new tokens at any time, with no limit in the code. Normal for some projects, a way to drain value in others — it depends who runs it and whether you trust them.",
    evidence: inSource
      ? snippet(source, MINT_FUNCTION)
      : "mint function present in the contract ABI",
  });

  return findings;
}
