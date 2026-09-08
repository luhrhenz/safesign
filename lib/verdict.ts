/**
 * The verdict engine. Pure rules over findings — no network, no AI, no key.
 *
 * README §2: the rules are the brain. Same contract in, same verdict out, every
 * time. Every reason the user reads is a `humanReason` string written by hand in
 * a rule file, so the tool is complete and shippable with nothing else wired up.
 */

import { highestSeverity } from "./checks";
import type { SourceProvenance } from "./fetchSource";
import type { Finding, Verdict, VerdictResult } from "./types";

export interface VerdictInput {
  kind: "contract" | "link";
  /** Did we read published source? Always false for a link. */
  verified: boolean;
  findings: Finding[];
  scam: {
    addressListed: boolean;
    domainListed: boolean;
    domainAllowlisted: boolean;
    /** A list was unreachable — we cannot claim "clean". */
    degraded: boolean;
  };
}

export function buildVerdict(input: VerdictInput): VerdictResult {
  // 1. A blocklist hit is the end of the conversation.
  if (input.scam.addressListed || input.scam.domainListed) {
    return {
      verdict: "DANGER",
      reasons: [
        input.scam.domainListed
          ? "This site is on a public list of known crypto phishing sites."
          : "This address is on a public list of addresses used to steal from wallets.",
        "People have already reported losing funds to it.",
      ],
      whatToDo: "Do not sign anything here. Close the page and do not send funds.",
    };
  }

  const worst = highestSeverity(input.findings);

  // 2. Anything a rule rates high can take the user's money.
  if (worst === "high") {
    return {
      verdict: "DANGER",
      reasons: pickReasons(input.findings, ["high"]),
      whatToDo: "Do not put money into this. The owner can take it or lock you out.",
    };
  }

  // 3. A link we could not fault is still only ever CAUTION: we checked the
  //    site's name against a list, not what the page will ask you to sign.
  if (input.kind === "link") {
    return {
      verdict: "CAUTION",
      reasons: [
        input.scam.degraded
          ? "We could not reach the list of known scam sites, so this site is unchecked."
          : "This site is not on any known scam list, but that is not the same as being safe.",
        "A safe-looking page can still ask you to sign something that empties your wallet.",
      ],
      whatToDo: "Read what you are signing. If it asks for permission over your tokens, stop.",
    };
  }

  const softReasons = pickReasons(input.findings, ["medium", "low"]);

  // 4. Unreadable code, an unreachable list, or a medium finding: be careful.
  if (!input.verified || input.scam.degraded || softReasons.length > 0) {
    return {
      verdict: "CAUTION",
      reasons: softReasons.length
        ? softReasons
        : ["The code behind this could not be checked, so nobody can say what it really does."],
      whatToDo: "Only continue if you know and trust who is behind this, and start small.",
    };
  }

  // 5. Read the code, found nothing that can hurt the holder.
  return {
    verdict: "SAFE",
    reasons: ["Nothing in the published code lets the owner take, freeze or dilute what you hold."],
    whatToDo: "Nothing found against it — still check you are on the right site before signing.",
  };
}

/**
 * The ambiguous middle, and the only place an optional AI rephrase is worth a
 * call (README §8.3). A blocklist hit, an unreadable contract and a clean
 * verified contract all say themselves.
 */
export function isAmbiguous(input: VerdictInput, verdict: Verdict): boolean {
  if (input.scam.addressListed || input.scam.domainListed) return false;
  if (verdict === "SAFE") return false;
  if (!input.verified) return false;
  return input.findings.filter((f) => f.severity !== "info").length > 1;
}

/**
 * Provenance, surfaced but never scored (Task 4 of the provider work).
 *
 * A partial match means the compiled code matches but the metadata hash does
 * not — almost always the same logic, built from slightly different files. That
 * is worth telling a reviewer, and it is NOT worth changing a severity over, so
 * this returns notes and touches nothing else.
 */
export function provenanceNotes(provenance: SourceProvenance | null): string[] | undefined {
  if (!provenance) return undefined;

  const where =
    provenance.provider === "sourcify"
      ? "Sourcify"
      : provenance.provider === "blockscout"
        ? "Blockscout"
        : "Etherscan";

  const notes = [`Source code read from ${where}.`];
  if (provenance.confidence === "medium") {
    notes.push(
      `Source verified via partial match (${provenance.matchType}) — the published code matches what is deployed, but not byte for byte.`,
    );
  }

  return notes;
}

function pickReasons(findings: Finding[], severities: Finding["severity"][]): string[] {
  return findings
    .filter((f) => severities.includes(f.severity))
    .slice(0, 3)
    .map((f) => f.humanReason);
}
