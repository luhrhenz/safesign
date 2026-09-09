/**
 * The accuracy benchmark. Opt-in, because it is slow and hits live networks:
 *
 *   SAFESIGN_BENCH=1 npx vitest run tests/accuracy.live.test.ts
 *
 * It writes docs/accuracy.md. Two numbers matter and they pull in opposite
 * directions:
 *
 *   FALSE ALARM RATE — how often a token millions of people hold is called
 *     DANGER. A safety tool that cries wolf on the stablecoin in your wallet
 *     is worse than no tool, because it teaches you to ignore the red one.
 *
 *   RULES-ONLY DETECTION — how often the static rules flag a known drainer
 *     with the scam list switched off. This is the honest measure of whether
 *     the analysis is doing work, or whether the blocklist is carrying it.
 *
 * Both are reported with the raw table underneath, so the numbers can be
 * checked rather than taken on trust.
 */

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { CHAINS, type ChainKey } from "../lib/chains";
import { fetchContract } from "../lib/fetchContract";
import { runChecks } from "../lib/checks";
import { buildVerdict } from "../lib/verdict";
import { LEGITIMATE, MALICIOUS_SAMPLE_SIZE, type CorpusEntry } from "../lib/benchmark/corpus";
import type { CheckContext, Verdict } from "../lib/types";

/** Scam lists forced clean, so only the static rules speak. */
const NO_LIST = {
  addressListed: false,
  domainListed: false,
  domainAllowlisted: false,
  degraded: false,
};

interface Row {
  label: string;
  chain: ChainKey;
  address: string;
  name: string;
  verified: boolean;
  verdict: Verdict;
  headline: string;
  findings: string[];
}

async function assess(entry: CorpusEntry): Promise<Row> {
  const contract = await fetchContract(entry.address, entry.chain);

  const ctx: CheckContext = {
    address: entry.address,
    chain: entry.chain,
    verified: contract.verified,
    source: contract.source,
    sourceLookupInconclusive: contract.sourceLookupInconclusive,
    contractName: contract.contractName,
    abi: contract.abi,
    bytecode: contract.bytecode,
    owner: contract.owner,
    ownerIsContract: contract.ownerIsContract,
    proxy: contract.proxy,
  };

  const findings = runChecks(ctx);
  const verdict = buildVerdict({
    kind: "contract",
    verified: contract.verified,
    findings,
    scam: NO_LIST,
  });

  return {
    label: entry.label,
    chain: entry.chain,
    address: entry.address,
    name: contract.contractName || "—",
    verified: contract.verified,
    verdict: verdict.verdict,
    headline: verdict.headline,
    findings: findings.map((f) => f.id),
  };
}

/** Deterministic sample of the live drainer list: every Nth contract address. */
async function sampleMalicious(size: number): Promise<string[]> {
  const res = await fetch(
    "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json",
    { signal: AbortSignal.timeout(20_000) },
  );
  const all: string[] = await res.json();
  // Most listed addresses are wallets, so the pool must be larger than the
  // sample -- but not so large that public RPCs start rate-limiting us, which
  // makes every address look like it has no code and silently empties the run.
  const step = Math.max(1, Math.floor(all.length / (size * 15)));
  return all.filter((_, i) => i % step === 0).slice(0, size * 15);
}

function table(rows: Row[]): string {
  const lines = [
    "| Token | Chain | Contract | Source | Verdict | Findings |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${CHAINS[r.chain].label} | \`${r.name}\` | ${r.verified ? "read" : "not published"} | **${r.verdict}** | ${r.findings.join(", ") || "none"} |`,
    );
  }
  return lines.join("\n");
}

const share = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(0)}%` : "—");

describe.runIf(process.env.SAFESIGN_BENCH === "1")("accuracy benchmark", () => {
  it(
    "measures false alarms on legitimate tokens and rules-only detection on drainers",
    { timeout: 600_000 },
    async () => {
      // ---- legitimate ----
      const legit: Row[] = [];
      for (const entry of LEGITIMATE) {
        try {
          const row = await assess(entry);
          legit.push(row);
          if (entry.expectName && row.name !== entry.expectName) {
            console.warn(`corpus mismatch: ${entry.label} is ${row.name}, expected ${entry.expectName}`);
          }
        } catch (err) {
          console.warn(`skipped ${entry.label}:`, err);
        }
      }

      const counts = {
        SAFE: legit.filter((r) => r.verdict === "SAFE").length,
        CAUTION: legit.filter((r) => r.verdict === "CAUTION").length,
        DANGER: legit.filter((r) => r.verdict === "DANGER").length,
      };

      // ---- malicious, with the list switched off ----
      const candidates = await sampleMalicious(MALICIOUS_SAMPLE_SIZE);
      const bad: Row[] = [];
      let examined = 0;

      for (const address of candidates) {
        if (bad.length >= MALICIOUS_SAMPLE_SIZE) break;
        examined++;
        // Paced deliberately: hammering public RPCs gets us throttled, and a
        // throttled eth_getCode is indistinguishable from "this is a wallet",
        // which would quietly empty the sample and inflate the result.
        await new Promise((r) => setTimeout(r, 120));
        try {
          // Drainers concentrate on Ethereum; one chain keeps the call budget
          // inside what public nodes will serve.
          const row = await assess({ chain: "ethereum", address, label: "listed drainer" });
          if (row.findings.includes("meta.not_a_contract")) continue;
          bad.push(row);
        } catch {
          continue;
        }
      }

      console.log(`sampled ${bad.length} contracts from ${examined} listed addresses`);

      const flagged = bad.filter((r) => r.verdict !== "SAFE").length;
      const caughtByRulesAlone = bad.filter((r) =>
        r.findings.some((f) => !f.startsWith("meta.")),
      ).length;

      const report = `# Accuracy benchmark

Generated by \`SAFESIGN_BENCH=1 npx vitest run tests/accuracy.live.test.ts\`
on ${new Date().toISOString().slice(0, 10)}. Live networks, scam lists switched
OFF so only the static rules speak.

## False alarms on tokens people actually hold

${legit.length} widely-held tokens across Celo, Base, Ethereum and BNB Chain.

| Verdict | Count | Share |
|---|---|---|
| No red flags | ${counts.SAFE} | ${share(counts.SAFE, legit.length)} |
| What this can do | ${counts.CAUTION} | ${share(counts.CAUTION, legit.length)} |
| **Do not sign** | **${counts.DANGER}** | **${share(counts.DANGER, legit.length)}** |

**False alarm rate: ${share(counts.DANGER, legit.length)}** — the share of
legitimate tokens told "do not sign".

${table(legit)}

## Rules-only detection on listed drainers

${bad.length} addresses sampled from the ScamSniffer drainer list, assessed with
the list switched off, to see whether the static analysis earns its place.

| Measure | Count | Share |
|---|---|---|
| Flagged at all (not clean) | ${flagged} | ${share(flagged, bad.length)} |
| Carried by a real rule, not just "code not published" | ${caughtByRulesAlone} | ${share(caughtByRulesAlone, bad.length)} |

${table(bad)}

## Reading these numbers honestly

- A drainer contract with no published source is caught as CAUTION on the
  strength of *not being readable*, which is a weak signal — the
  "carried by a real rule" row is the one that says whether the analysis works.
- The scam list catches these in production regardless. This measures the
  analysis, not the product.
- The corpus is small and hand-picked. It is a floor on quality, not a claim
  about the long tail.
`;

      mkdirSync("docs", { recursive: true });
      writeFileSync("docs/accuracy.md", report);
      console.log(report);

      // The bar this project has to clear: never cry wolf on a major token.
      expect(counts.DANGER).toBe(0);
      expect(legit.length).toBeGreaterThan(15);
    },
  );
});
