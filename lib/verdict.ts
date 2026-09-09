/**
 * The verdict engine. Pure rules over findings — no network, no AI, no key.
 *
 * The model is about CERTAINTY, not capability. Static analysis can prove what
 * code is able to do; it cannot read intent. USDT's owner really can freeze any
 * wallet and mint without limit, and USDT is the most used token in crypto —
 * the same code in an anonymous launch is a trap. Nothing in the bytecode
 * separates them.
 *
 * So there are three tiers, and only proof condemns:
 *
 *   DANGER  — facts. On a scam list, or code that stops everyone selling.
 *   CAUTION — capabilities. Here is what the owner can do; you decide.
 *   SAFE    — no red flags found. Not a promise, and never called "safe".
 *
 * A capability alone can never reach DANGER. That rule is what stopped this
 * tool telling people not to touch the stablecoin in their wallet.
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
  const facts = input.findings.filter((f) => f.kind === "fact");
  const capabilities = input.findings.filter((f) => f.kind === "capability");

  // 1. On a list. Someone has already been robbed by this address.
  if (input.scam.addressListed || input.scam.domainListed) {
    return {
      verdict: "DANGER",
      headline: "Do not sign",
      lede: input.scam.domainListed
        ? "This site is on a public list of known crypto phishing sites."
        : "This address is on a public list of addresses used to steal from wallets.",
      reasons: ["People have already reported losing money to it."],
      whatToDo: "Do not sign anything here. Close the page and do not send funds.",
    };
  }

  // 2. The code itself blocks everyone. True whoever runs it.
  if (facts.length > 0) {
    return {
      verdict: "DANGER",
      headline: "Do not sign",
      lede: "The code stops people getting their money back out. This is how a honeypot works.",
      reasons: pick(facts),
      whatToDo: "Do not buy this. You would not be able to sell it again.",
    };
  }

  // 3. A link we could not fault is still only ever CAUTION: we checked the
  //    site's name against a list, not what the page will ask you to sign.
  if (input.kind === "link") {
    return {
      verdict: "CAUTION",
      headline: "Be careful",
      lede: input.scam.degraded
        ? "We could not reach the list of known scam sites, so this site is unchecked."
        : "This site is not on a scam list. That is not the same as being safe — a new scam is on no list yet.",
      reasons: ["A safe-looking page can still ask you to sign something that empties your wallet."],
      whatToDo: "Read what you are signing. If it asks for permission over your tokens, stop.",
    };
  }

  // 4. Could not read the code, or a list was down. Say which.
  if (!input.verified || input.scam.degraded) {
    return {
      verdict: "CAUTION",
      headline: "Be careful",
      lede: !input.verified
        ? "The code behind this could not be read, so nobody can tell you what it does."
        : "One of our checks could not run, so this is incomplete.",
      reasons: capabilities.length > 0 ? pick(capabilities) : [],
      whatToDo: "Only continue if you know and trust who is behind this, and start small.",
    };
  }

  // 5. Powers, disclosed. This is the tier USDT belongs in — the findings are
  //    real and shown in full, but nothing here says scam.
  if (capabilities.length > 0) {
    return {
      verdict: "CAUTION",
      headline: "What this can do",
      lede: "Nothing here says scam. These are things whoever runs it is able to do — whether that is fine depends on who they are.",
      reasons: pick(capabilities),
      whatToDo: "If you know and trust who runs this, these may be normal. If you do not, treat them as risks.",
    };
  }

  // 6. Nothing found. Still not a promise.
  return {
    verdict: "SAFE",
    headline: "No red flags",
    lede: "We read the code and found no way for anyone to freeze, take or print what you hold.",
    reasons: ["Being clear of red flags is not a guarantee — it is still your call."],
    whatToDo: "Check you are on the right site, and that you meant to sign this.",
  };
}

/**
 * The ambiguous middle, and the only place an optional AI rephrase is worth a
 * call. A blocklist hit, an unreadable contract and a clean contract all say
 * themselves.
 */
export function isAmbiguous(input: VerdictInput, verdict: Verdict): boolean {
  if (input.scam.addressListed || input.scam.domainListed) return false;
  if (verdict === "SAFE") return false;
  if (!input.verified) return false;
  return input.findings.filter((f) => f.kind !== "context").length > 1;
}

/**
 * Provenance, surfaced but never scored. A partial match means the compiled
 * code matches but the metadata hash does not — worth telling a reviewer, and
 * not worth changing a severity over.
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

/** Worst first, at most three — the card has room for three lines. */
function pick(findings: Finding[]): string[] {
  const worst = highestSeverity(findings);
  const ordered = [
    ...findings.filter((f) => f.severity === worst),
    ...findings.filter((f) => f.severity !== worst),
  ];
  return ordered.slice(0, 3).map((f) => f.humanReason);
}
