import { describe, expect, it } from "vitest";
import { normalizeInput } from "../lib/chains";
import { flattenEtherscanSource } from "../lib/fetchSource";
import { buildVerdict, isAmbiguous, type VerdictInput } from "../lib/verdict";
import { cacheKey, isCacheable } from "../lib/cache";
import { parseOutput, stripToJson } from "../lib/llm/callLLM";
import type { CheckResponse, Finding } from "../lib/types";

const CLEAN_SCAN = {
  addressListed: false,
  domainListed: false,
  domainAllowlisted: false,
  degraded: false,
};

const finding = (severity: Finding["severity"], id = `test.${severity}`): Finding => ({
  id,
  severity,
  humanReason: `something ${severity}`,
});

const contractInput = (overrides: Partial<VerdictInput> = {}): VerdictInput => ({
  kind: "contract",
  verified: true,
  findings: [],
  scam: CLEAN_SCAN,
  ...overrides,
});

describe("input normalization", () => {
  it("takes a bare address", () => {
    expect(normalizeInput(" 0xAbC0000000000000000000000000000000000001 ")).toEqual({
      kind: "address",
      address: "0xabc0000000000000000000000000000000000001",
    });
  });

  it("reads the chain from an eip-3770 prefix", () => {
    expect(normalizeInput("celo:0xABC0000000000000000000000000000000000001").chainHint).toBe(
      "celo",
    );
  });

  it("reads the chain and address from an explorer link", () => {
    const result = normalizeInput(
      "https://basescan.org/token/0xabc0000000000000000000000000000000000001",
    );
    expect(result).toMatchObject({
      kind: "address",
      chainHint: "base",
      domain: "basescan.org",
      address: "0xabc0000000000000000000000000000000000001",
    });
  });

  it("pulls an address out of a dApp query string", () => {
    const result = normalizeInput(
      "https://swap.example.com/trade?outputCurrency=0xABC0000000000000000000000000000000000001",
    );
    expect(result.address).toBe("0xabc0000000000000000000000000000000000001");
    expect(result.domain).toBe("swap.example.com");
  });

  it("keeps a link with no address as a link", () => {
    expect(normalizeInput("claim-airdrop.example")).toEqual({
      kind: "link",
      chainHint: undefined,
      domain: "claim-airdrop.example",
    });
  });

  it("rejects nonsense", () => {
    expect(normalizeInput("hello there").kind).toBe("unknown");
    expect(normalizeInput("   ").kind).toBe("unknown");
  });
});

describe("etherscan source flattening", () => {
  it("passes plain solidity through", () => {
    expect(flattenEtherscanSource("contract A {}")).toBe("contract A {}");
  });

  it("unwraps the double-brace standard-json form", () => {
    const raw = `{{"language":"Solidity","sources":{"A.sol":{"content":"contract A {}"},"B.sol":{"content":"contract B {}"}}}}`;
    const flat = flattenEtherscanSource(raw);
    expect(flat).toContain("contract A {}");
    expect(flat).toContain("contract B {}");
    expect(flat).toContain("A.sol");
  });

  it("handles a bare path -> content map", () => {
    expect(flattenEtherscanSource(`{"A.sol":{"content":"contract A {}"}}`)).toContain("contract A {}");
  });

  it("returns empty for an unverified contract", () => {
    expect(flattenEtherscanSource("")).toBe("");
  });
});

describe("verdict engine (rules only)", () => {
  it("is DANGER when the address is on a scam list", () => {
    const result = buildVerdict(
      contractInput({ scam: { ...CLEAN_SCAN, addressListed: true } }),
    );
    expect(result.verdict).toBe("DANGER");
  });

  it("is DANGER when the site is on a phishing list", () => {
    const result = buildVerdict({
      kind: "link",
      verified: false,
      findings: [],
      scam: { ...CLEAN_SCAN, domainListed: true },
    });
    expect(result.verdict).toBe("DANGER");
  });

  it("is DANGER on a high-severity finding", () => {
    expect(buildVerdict(contractInput({ findings: [finding("high")] })).verdict).toBe("DANGER");
  });

  it("never says SAFE about a contract with no published code", () => {
    expect(buildVerdict(contractInput({ verified: false })).verdict).toBe("CAUTION");
  });

  it("never says SAFE when a scam list could not be reached", () => {
    expect(
      buildVerdict(contractInput({ scam: { ...CLEAN_SCAN, degraded: true } })).verdict,
    ).toBe("CAUTION");
  });

  it("never says SAFE about a link, even a clean one", () => {
    const result = buildVerdict({
      kind: "link",
      verified: false,
      findings: [],
      scam: CLEAN_SCAN,
    });
    expect(result.verdict).toBe("CAUTION");
  });

  it("allows SAFE only on a clean, readable contract", () => {
    expect(buildVerdict(contractInput()).verdict).toBe("SAFE");
  });

  it("gives at most three reasons and a what-to-do line", () => {
    const result = buildVerdict(
      contractInput({
        findings: [finding("high", "a"), finding("high", "b"), finding("high", "c"), finding("high", "d")],
      }),
    );
    expect(result.reasons.length).toBeLessThanOrEqual(3);
    expect(result.whatToDo.length).toBeGreaterThan(0);
  });

  it("is deterministic — same input, same verdict", () => {
    const input = contractInput({ findings: [finding("medium")] });
    expect(buildVerdict(input)).toEqual(buildVerdict(input));
  });
});

describe("when the optional rephrase layer may run", () => {
  it("never for a scam-list hit — that answer speaks for itself", () => {
    const input = contractInput({ scam: { ...CLEAN_SCAN, addressListed: true } });
    expect(isAmbiguous(input, "DANGER")).toBe(false);
  });

  it("never for a clean SAFE result", () => {
    expect(isAmbiguous(contractInput(), "SAFE")).toBe(false);
  });

  it("never for an unreadable contract", () => {
    const input = contractInput({ verified: false, findings: [finding("medium")] });
    expect(isAmbiguous(input, "CAUTION")).toBe(false);
  });

  it("only for a readable contract with several findings to weigh", () => {
    const input = contractInput({ findings: [finding("medium", "a"), finding("medium", "b")] });
    expect(isAmbiguous(input, "CAUTION")).toBe(true);
  });
});

describe("llm output handling", () => {
  it("digs JSON out of a fenced, chatty reply", () => {
    const raw = 'Sure!\n```json\n{"reasons":["a"],"whatToDo":"b"}\n```\nHope that helps';
    expect(JSON.parse(stripToJson(raw))).toEqual({ reasons: ["a"], whatToDo: "b" });
  });

  it("drops a thinking block before the JSON", () => {
    const raw = '<think>hmm</think>{"reasons":["a"],"whatToDo":"b"}';
    expect(JSON.parse(stripToJson(raw))).toEqual({ reasons: ["a"], whatToDo: "b" });
  });

  it("returns empty when there is no JSON at all", () => {
    expect(stripToJson("I cannot help with that")).toBe("");
  });
});

describe("the rephrase validator", () => {
  const original = {
    verdict: "DANGER" as const,
    reasons: ["reason one", "reason two"],
    whatToDo: "Do not put money into this.",
  };

  it("accepts a faithful rewrite", () => {
    const raw = '{"reasons":["simpler one","simpler two"],"whatToDo":"Do not put money in."}';
    expect(parseOutput(raw, original)).toEqual({
      reasons: ["simpler one", "simpler two"],
      whatToDo: "Do not put money in.",
    });
  });

  it("rejects a rewrite that drops a reason", () => {
    expect(parseOutput('{"reasons":["only one"],"whatToDo":"stop"}', original)).toBeNull();
  });

  it("rejects a rewrite that invents a reason", () => {
    const raw = '{"reasons":["a","b","c"],"whatToDo":"stop"}';
    expect(parseOutput(raw, original)).toBeNull();
  });

  it("rejects an empty reason", () => {
    expect(parseOutput('{"reasons":["a","  "],"whatToDo":"stop"}', original)).toBeNull();
  });

  it("rejects a missing whatToDo", () => {
    expect(parseOutput('{"reasons":["a","b"]}', original)).toBeNull();
  });

  it("rejects an essay in place of a warning", () => {
    const raw = JSON.stringify({ reasons: ["a", "b"], whatToDo: "x".repeat(400) });
    expect(parseOutput(raw, original)).toBeNull();
  });

  it("rejects prose with no JSON, so the rules wording survives", () => {
    expect(parseOutput("I think this token is probably fine!", original)).toBeNull();
  });
});

describe("cache", () => {
  it("keys a contract by chain and address", () => {
    expect(cacheKey({ chain: "celo", address: "0xabc" })).toBe("safesign:v1:celo:0xabc");
  });

  it("keys a link by domain", () => {
    expect(cacheKey({ domain: "scam.example" })).toBe("safesign:v1:link:scam.example");
  });

  it("refuses to store an incomplete check", () => {
    const degraded = {
      verdict: "CAUTION",
      reasons: [],
      whatToDo: "",
      engine: "rules",
      degraded: true,
      subject: { kind: "address" },
      findings: [],
    } as unknown as CheckResponse;
    expect(isCacheable(degraded)).toBe(false);
  });

  it("stores a complete check", () => {
    const complete = {
      verdict: "SAFE",
      reasons: [],
      whatToDo: "",
      engine: "rules",
      degraded: false,
      subject: { kind: "address" },
      findings: [],
    } as unknown as CheckResponse;
    expect(isCacheable(complete)).toBe(true);
  });
});
