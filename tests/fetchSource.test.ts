import { describe, expect, it } from "vitest";
import {
  PROVIDER_ORDER,
  fetchSource,
  parseBlockscout,
  parseSourcify,
  type SourceFound,
} from "../lib/fetchSource";
import { runChecks } from "../lib/checks";
import { buildVerdict, provenanceNotes } from "../lib/verdict";
import { context, ids } from "./helpers";
import sourcifyExact from "./fixtures/sourcify-cusd-exact.json";
import sourcifyPartial from "./fixtures/sourcify-partial.json";
import blockscoutCusd from "./fixtures/blockscout-cusd.json";

const CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const CELO = 42220;
const BASE = 8453;

const CLEAN_SCAN = {
  addressListed: false,
  domainListed: false,
  domainAllowlisted: false,
  degraded: false,
};

/**
 * A fetch stand-in driven by a URL-substring → response map, so a test states
 * exactly which provider answers what. Anything unmatched 404s.
 */
function stubFetch(routes: Record<string, { status: number; body?: unknown } | "throw">) {
  const calls: string[] = [];

  const impl = (async (url: string | URL) => {
    const href = String(url);
    calls.push(href);

    for (const [fragment, response] of Object.entries(routes)) {
      if (!href.includes(fragment)) continue;
      if (response === "throw") throw new Error("network down");
      return new Response(response.body === undefined ? "" : JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
  }) as unknown as typeof fetch;

  return { impl, calls };
}

describe("provider order", () => {
  it("is Sourcify first, then Etherscan, then Blockscout", () => {
    expect(PROVIDER_ORDER).toEqual(["sourcify", "etherscan", "blockscout"]);
  });
});

describe("Sourcify (primary, keyless)", () => {
  it("maps an exact match to high confidence", async () => {
    const { impl } = stubFetch({ "sourcify.dev": { status: 200, body: sourcifyExact } });

    const result = (await fetchSource(CELO, CUSD, {
      fetchImpl: impl,
      etherscanKey: null,
    })) as SourceFound;

    expect(result.found).toBe(true);
    expect(result.provider).toBe("sourcify");
    expect(result.matchType).toBe("exact_match");
    expect(result.confidence).toBe("high");
    expect(result.contractName).toBe("StableTokenProxy");
    expect(result.source).toContain("pragma solidity");
  });

  it("maps a partial match to medium confidence", async () => {
    const { impl } = stubFetch({ "sourcify.dev": { status: 200, body: sourcifyPartial } });

    const result = (await fetchSource(CELO, CUSD, {
      fetchImpl: impl,
      etherscanKey: null,
    })) as SourceFound;

    expect(result.matchType).toBe("match");
    expect(result.confidence).toBe("medium");
  });

  it("treats a null match as no source", () => {
    expect(parseSourcify({ match: null, creationMatch: null, runtimeMatch: null })).toBeNull();
  });

  it("falls back to runtimeMatch when the top-level match is absent", () => {
    const parsed = parseSourcify({
      runtimeMatch: "exact_match",
      sources: { "A.sol": { content: "contract A {}" } },
    });
    expect(parsed?.confidence).toBe("high");
  });

  it("stops at Sourcify — later providers are never called", async () => {
    const { impl, calls } = stubFetch({ "sourcify.dev": { status: 200, body: sourcifyExact } });
    await fetchSource(CELO, CUSD, { fetchImpl: impl, etherscanKey: "a-key" });

    expect(calls.some((c) => c.includes("sourcify.dev"))).toBe(true);
    expect(calls.some((c) => c.includes("etherscan.io"))).toBe(false);
    expect(calls.some((c) => c.includes("blockscout.com"))).toBe(false);
  });
});

describe("Etherscan (dormant until a key exists)", () => {
  it("is skipped silently with no key, and leaks no key error", async () => {
    const { impl, calls } = stubFetch({ "sourcify.dev": { status: 404 } });

    const result = await fetchSource(BASE, CUSD, { fetchImpl: impl, etherscanKey: null });

    expect(result.found).toBe(false);
    if (result.found) return;

    expect(calls.some((c) => c.includes("etherscan.io"))).toBe(false);

    const etherscan = result.attempts.find((a) => a.provider === "etherscan");
    expect(etherscan?.outcome).toBe("skipped");
    // Never an error, and never anything key-shaped.
    expect(etherscan?.outcome).not.toBe("error");
    expect(JSON.stringify(result.attempts)).not.toMatch(/api[_-]?key|apikey=/i);
  });

  it("is attempted, and answers, once a key exists", async () => {
    const { impl, calls } = stubFetch({
      "sourcify.dev": { status: 404 },
      "etherscan.io": {
        status: 200,
        body: {
          status: "1",
          result: [
            {
              SourceCode: "contract OnlyOnEtherscan {}",
              ContractName: "OnlyOnEtherscan",
              CompilerVersion: "v0.8.20+commit.a1b79de6",
              ABI: "[]",
            },
          ],
        },
      },
    });

    const result = (await fetchSource(BASE, CUSD, {
      fetchImpl: impl,
      etherscanKey: "a-key",
    })) as SourceFound;

    expect(calls.some((c) => c.includes("etherscan.io"))).toBe(true);
    expect(result.provider).toBe("etherscan");
    expect(result.confidence).toBe("high");
    expect(result.contractName).toBe("OnlyOnEtherscan");
  });

  it("a contract only on Etherscan reads as unverified while the key is absent", async () => {
    const { impl } = stubFetch({ "sourcify.dev": { status: 404 } });

    const result = await fetchSource(BASE, CUSD, { fetchImpl: impl, etherscanKey: null });
    expect(result.found).toBe(false);

    // …and that is a CAUTION, never a failure.
    const findings = runChecks(context({ verified: false, source: "", bytecode: "0x60806040" }));
    expect(ids(findings)).toContain("meta.unverified_source");
    expect(
      buildVerdict({ kind: "contract", verified: false, findings, scam: CLEAN_SCAN }).verdict,
    ).toBe("CAUTION");
  });
});

describe("Blockscout (Celo only, keyless)", () => {
  it("answers for Celo when Sourcify has nothing", async () => {
    const { impl } = stubFetch({
      "sourcify.dev": { status: 404 },
      "blockscout.com": { status: 200, body: blockscoutCusd },
    });

    const result = (await fetchSource(CELO, CUSD, {
      fetchImpl: impl,
      etherscanKey: null,
    })) as SourceFound;

    expect(result.provider).toBe("blockscout");
    expect(result.confidence).toBe("high");
    expect(result.contractName).toBe("StableTokenProxy");
  });

  it("is skipped on a chain with no instance", async () => {
    const { impl, calls } = stubFetch({ "sourcify.dev": { status: 404 } });

    const result = await fetchSource(BASE, CUSD, { fetchImpl: impl, etherscanKey: null });
    expect(calls.some((c) => c.includes("blockscout.com"))).toBe(false);
    if (result.found) throw new Error("expected no source");
    expect(result.attempts.find((a) => a.provider === "blockscout")?.outcome).toBe("skipped");
  });

  it("downgrades a partial verification to medium", () => {
    const parsed = parseBlockscout({
      ...blockscoutCusd,
      is_partially_verified: true,
      is_fully_verified: false,
    });
    expect(parsed?.confidence).toBe("medium");
    expect(parsed?.matchType).toBe("partial");
  });

  it("ignores an unverified entry", () => {
    expect(parseBlockscout({ ...blockscoutCusd, is_verified: false })).toBeNull();
  });
});

describe("nobody has the source", () => {
  it("is a clean not-found when providers answer, not an error", async () => {
    const { impl } = stubFetch({
      "sourcify.dev": { status: 404 },
      "blockscout.com": { status: 404 },
    });

    const result = await fetchSource(CELO, CUSD, { fetchImpl: impl, etherscanKey: null });
    if (result.found) throw new Error("expected no source");

    expect(result.inconclusive).toBe(false);
    expect(result.attempts.map((a) => a.provider)).toEqual([
      "sourcify",
      "etherscan",
      "blockscout",
    ]);
  });

  it("says CAUTION, could not verify source — never a hard failure", async () => {
    const { impl } = stubFetch({
      "sourcify.dev": { status: 404 },
      "blockscout.com": { status: 404 },
    });

    const result = await fetchSource(CELO, CUSD, { fetchImpl: impl, etherscanKey: null });
    const findings = runChecks(
      context({ verified: result.found, source: "", sourceLookupInconclusive: false }),
    );
    const verdict = buildVerdict({
      kind: "contract",
      verified: false,
      findings,
      scam: CLEAN_SCAN,
    });

    expect(verdict.verdict).toBe("CAUTION");
    expect(verdict.reasons.join(" ")).toMatch(/could not verify/i);
  });

  it("marks an all-providers-down run inconclusive, and says so differently", async () => {
    const { impl } = stubFetch({ "sourcify.dev": "throw", "blockscout.com": "throw" });

    const result = await fetchSource(CELO, CUSD, { fetchImpl: impl, etherscanKey: null });
    if (result.found) throw new Error("expected no source");

    expect(result.inconclusive).toBe(true);

    const findings = runChecks(context({ verified: false, source: "", sourceLookupInconclusive: true }));
    expect(ids(findings)).toContain("meta.source_unavailable");
  });
});

describe("provenance surfacing", () => {
  it("names the provider without any caveat on an exact match", () => {
    const notes = provenanceNotes({
      provider: "sourcify",
      confidence: "high",
      matchType: "exact_match",
    });
    expect(notes?.join(" ")).toContain("Sourcify");
    expect(notes?.join(" ")).not.toMatch(/partial/i);
  });

  it("flags a partial match as lower confidence", () => {
    const notes = provenanceNotes({
      provider: "sourcify",
      confidence: "medium",
      matchType: "match",
    });
    expect(notes?.join(" ")).toMatch(/partial match/i);
  });

  it("says nothing when no provider had source", () => {
    expect(provenanceNotes(null)).toBeUndefined();
  });
});

describe("cUSD on Celo, through the Sourcify path", () => {
  /**
   * The point of this test: source came from Sourcify, whose own proxy
   * resolver reports `isProxy: false` for this contract — but our independent
   * EIP-1967 slot read finds the implementation, so the verdict still warns.
   */
  it("is still CAUTION, citing the upgradeable proxy read off-chain", async () => {
    const { impl } = stubFetch({ "sourcify.dev": { status: 200, body: sourcifyExact } });

    const source = (await fetchSource(CELO, CUSD, {
      fetchImpl: impl,
      etherscanKey: null,
    })) as SourceFound;

    expect(source.provider).toBe("sourcify");
    expect(source.confidence).toBe("high");

    // Values as read live from forno.celo.org on 2026-09-08.
    const findings = runChecks(
      context({
        address: CUSD.toLowerCase(),
        verified: true,
        source: source.source,
        contractName: source.contractName,
        abi: source.abi,
        proxy: { isProxy: true, implementation: "0x815795c30d0758a297b08cd4e0643620c974c318" },
        owner: "0x58099b74f4acd642da77b4b7966b4138ec5ba458",
        ownerIsContract: true,
      }),
    );

    expect(ids(findings)).toContain("ownership.upgradeable");
    expect(ids(findings)).toContain("ownership.owner_is_contract");
    expect(ids(findings)).not.toContain("meta.unverified_source");

    const verdict = buildVerdict({
      kind: "contract",
      verified: true,
      findings,
      scam: CLEAN_SCAN,
    });
    expect(verdict.verdict).toBe("CAUTION");
    expect(verdict.reasons.join(" ")).toMatch(/upgrad|replaced|change/i);
  });
});

/**
 * Opt-in live check: `SAFESIGN_LIVE=1 npm test`. Kept out of the normal run so
 * the suite stays deterministic and offline.
 */
describe.runIf(process.env.SAFESIGN_LIVE === "1")("live smoke", () => {
  it("really resolves cUSD through Sourcify", { timeout: 30_000 }, async () => {
    const result = await fetchSource(CELO, CUSD, { etherscanKey: null });
    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.provider).toBe("sourcify");
    expect(result.source.length).toBeGreaterThan(100);
  });
});
