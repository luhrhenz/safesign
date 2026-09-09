import { describe, expect, it } from "vitest";
import { normalizeInput, unrecognizedMessage } from "../lib/chains";
import { isUnrecognized, shouldRenderVerdictCard } from "../lib/types";
import type { CheckApiResponse } from "../lib/types";

/** A real Stellar contract strkey (C…) and account strkey (G…), 56 chars each. */
const STELLAR_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const STELLAR_ACCOUNT = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const EVM = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

describe("Stellar strkeys are rejected, not guessed at", () => {
  it("classifies a contract strkey as unrecognized with the Stellar hint", () => {
    const result = normalizeInput(STELLAR_CONTRACT);

    expect(result.kind).toBe("unrecognized");
    expect(result.reason).toBe("stellar");
  });

  it("classifies an account strkey the same way", () => {
    const result = normalizeInput(STELLAR_ACCOUNT);

    expect(result.kind).toBe("unrecognized");
    expect(result.reason).toBe("stellar");
  });

  it("never routes a strkey to a checker — no address, no domain", () => {
    const result = normalizeInput(STELLAR_CONTRACT);

    // The regression: this used to come back as a domain and get a verdict.
    expect(result.address).toBeUndefined();
    expect(result.domain).toBeUndefined();
    expect(result.kind).not.toBe("url");
    expect(result.kind).not.toBe("evm_address");
  });

  it("leaves the input exactly as typed — no lowercasing, no mutation", () => {
    const result = normalizeInput(STELLAR_CONTRACT);

    expect(result.raw).toBe(STELLAR_CONTRACT);
    expect(result.raw).toMatch(/[A-Z]/);
    expect(result.raw).not.toBe(STELLAR_CONTRACT.toLowerCase());
  });

  it("says Stellar, and says SafeSign does not do Stellar", () => {
    const message = unrecognizedMessage("stellar");

    expect(message).toContain("Stellar");
    expect(message).toContain("EVM chains only");
    // No claim to have checked THIS input.
    expect(message).not.toMatch(/site checked|scam list|looks safe|not on any/i);
  });
});

describe("other unrecognized input", () => {
  it.each([
    ["a bare random string", "asdf1234"],
    ["prose", "hello there"],
    ["a single word with no dot", "localhost"],
    ["an empty string", "   "],
    ["a truncated address", "0x765DE816845861e75A25fCA122bb6898B8B128"],
    ["a non-http scheme", "mailto:someone@example.com"],
  ])("rejects %s", (_label, input) => {
    const result = normalizeInput(input);
    expect(result.kind).toBe("unrecognized");
    expect(result.reason).toBe("generic");
  });

  it("uses the generic message, which names the chains we do check", () => {
    const message = unrecognizedMessage("generic");

    expect(message).toContain("Celo, Base, Ethereum, and BNB Chain");
    expect(message).not.toMatch(/site checked|scam list|looks safe|not on any/i);
  });

  it("does not mistake a base32 blob for a hostname", () => {
    // The exact shape of the bug: URL() accepts this as a single-label host.
    expect(normalizeInput(STELLAR_CONTRACT).kind).not.toBe("url");
    expect(normalizeInput("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567").kind).toBe("unrecognized");
  });
});

describe("real links still classify as URL", () => {
  it.each([
    ["with a scheme", "https://example.com", "example.com"],
    ["bare", "example.com", "example.com"],
    ["with www", "https://www.example.com/claim", "example.com"],
    ["with a path and query", "https://app.example.co.uk/swap?a=1", "app.example.co.uk"],
  ])("accepts a domain %s", (_label, input, domain) => {
    const result = normalizeInput(input);
    expect(result.kind).toBe("url");
    expect(result.domain).toBe(domain);
  });

  it("still pulls an address out of a dApp link", () => {
    const result = normalizeInput(`https://swap.example.com/trade?outputCurrency=${EVM}`);
    expect(result.kind).toBe("evm_address");
    expect(result.address).toBe(EVM.toLowerCase());
    expect(result.domain).toBe("swap.example.com");
  });

  it("checks the REAL host when a link hides one behind userinfo", () => {
    // https://example.com@evil.example is a phishing shape: the real host is
    // the one after the @, and that is the one we report and check.
    const result = normalizeInput("https://example.com@evil.example/claim");
    expect(result.kind).toBe("url");
    expect(result.domain).toBe("evil.example");
  });

  it("still reads the chain off an explorer link", () => {
    const result = normalizeInput("https://basescan.org/token/0xabc0000000000000000000000000000000000001");
    expect(result.kind).toBe("evm_address");
    expect(result.chainHint).toBe("base");
  });
});

describe("EVM addresses still classify as addresses", () => {
  it("accepts a checksummed address and lowercases it for lookup", () => {
    const result = normalizeInput(EVM);
    expect(result.kind).toBe("evm_address");
    expect(result.address).toBe(EVM.toLowerCase());
    // …while the raw input is preserved as typed.
    expect(result.raw).toBe(EVM);
  });

  it("accepts an all-lowercase address", () => {
    expect(normalizeInput(EVM.toLowerCase()).kind).toBe("evm_address");
  });

  it("accepts an eip-3770 prefix and reads the chain from it", () => {
    const result = normalizeInput(`celo:${EVM}`);
    expect(result.kind).toBe("evm_address");
    expect(result.chainHint).toBe("celo");
  });
});

describe("the UI never shows a traffic light for unrecognized input", () => {
  const unrecognized: CheckApiResponse = {
    status: "unrecognized",
    message: unrecognizedMessage("stellar"),
  };

  const verdict = {
    status: "verdict",
    verdict: "CAUTION",
    reasons: ["something"],
    whatToDo: "be careful",
    engine: "rules",
    degraded: false,
    subject: { kind: "address", address: EVM.toLowerCase() },
    findings: [],
  } as unknown as CheckApiResponse;

  it("renders no verdict card for an unrecognized response", () => {
    expect(shouldRenderVerdictCard(unrecognized)).toBe(false);
  });

  it("renders the card for a real verdict", () => {
    expect(shouldRenderVerdictCard(verdict)).toBe(true);
  });

  it("renders nothing before the first check", () => {
    expect(shouldRenderVerdictCard(null)).toBe(false);
  });

  it("narrows to a message with no verdict fields on it", () => {
    expect(isUnrecognized(unrecognized)).toBe(true);

    // Nothing downstream can read a verdict, subject or findings off this.
    expect("verdict" in unrecognized).toBe(false);
    expect("subject" in unrecognized).toBe(false);
    expect("findings" in unrecognized).toBe(false);
  });
});
