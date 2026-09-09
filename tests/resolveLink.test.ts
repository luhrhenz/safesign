import { describe, expect, it } from "vitest";
import { normalizeInput, linkGuidance } from "../lib/chains";
import { resolveLink, settleTarget, type LinkTarget } from "../lib/resolveLink";

const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USDC_ETH = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
/** A real Uniswap v3 pair, used as the "this is a pair" case. */
const PAIR = "0x5d0bc342178c8fe2c2f9a9fcc9d52555c99936db";

/** Deterministic stand-ins for the on-chain pair test. */
const asPair = { isPair: async () => true };
const asToken = { isPair: async () => false };

const parse = (input: string) => resolveLink(new URL(input));

describe("dexscreener links", () => {
  it("reads the chain slug and address off the canonical URL", () => {
    // Shape confirmed from Dexscreener's own API: /{chainSlug}/{pairAddress}.
    const target = parse(`https://dexscreener.com/base/${PAIR}`);
    expect(target).toMatchObject({ kind: "ambiguous", chain: "base", address: PAIR });
  });

  it("resolves to the address when the chain says it is a token", async () => {
    const settled = await settleTarget(parse(`https://dexscreener.com/base/${USDC_BASE}`), asToken);
    expect(settled).toMatchObject({ kind: "address", chain: "base", address: USDC_BASE });
  });

  it("refuses when the chain says it is a trading pair", async () => {
    const settled = await settleTarget(parse(`https://dexscreener.com/base/${PAIR}`), asPair);
    expect(settled.kind).toBe("pair");
  });

  it("maps every slug we support", () => {
    const cases: [string, string][] = [
      ["ethereum", "ethereum"],
      ["base", "base"],
      ["bsc", "bsc"],
      ["celo", "celo"],
    ];
    for (const [slug, chain] of cases) {
      expect(parse(`https://dexscreener.com/${slug}/${USDC_ETH}`)).toMatchObject({ chain });
    }
  });

  it("names an unsupported chain rather than failing silently", () => {
    const target = parse("https://dexscreener.com/solana/So11111111111111111111111111111111111111112");
    expect(target).toMatchObject({ kind: "unsupported_chain", chainName: "Solana" });
  });

  it("is unresolved when the path carries no address", () => {
    expect(parse("https://dexscreener.com/base").kind).toBe("unresolved");
  });
});

describe("dextools links", () => {
  it("resolves a token-explorer link, with or without the language segment", () => {
    // Both shapes return 200 live; the language segment is dropped on redirect.
    for (const path of [
      `https://www.dextools.io/app/en/base/token-explorer/${USDC_BASE}`,
      `https://www.dextools.io/app/base/token-explorer/${USDC_BASE}`,
    ]) {
      expect(parse(path)).toMatchObject({ kind: "address", chain: "base", address: USDC_BASE });
    }
  });

  it("maps dextools' own name for Ethereum", () => {
    expect(parse(`https://www.dextools.io/app/en/ether/token-explorer/${USDC_ETH}`)).toMatchObject({
      kind: "address",
      chain: "ethereum",
    });
  });

  it("refuses a pair-explorer link without needing the chain", () => {
    expect(parse(`https://www.dextools.io/app/en/ether/pair-explorer/${PAIR}`).kind).toBe("pair");
  });

  it("names an unsupported chain", () => {
    expect(parse("https://www.dextools.io/app/en/solana/token-explorer/abc")).toMatchObject({
      kind: "unsupported_chain",
      chainName: "Solana",
    });
  });
});

describe("explorer links", () => {
  it.each([
    ["https://etherscan.io/token/", "ethereum"],
    ["https://basescan.org/address/", "base"],
    ["https://bscscan.com/token/", "bsc"],
    ["https://celoscan.io/address/", "celo"],
  ])("reads the chain from %s", (prefix, chain) => {
    expect(parse(`${prefix}${USDC_ETH}`)).toMatchObject({ kind: "address", chain, address: USDC_ETH });
  });

  it("lets the V2 multichain chainid parameter win over the domain", () => {
    const target = parse(`https://etherscan.io/token/${USDC_BASE}?chainid=8453`);
    expect(target).toMatchObject({ kind: "address", chain: "base" });
  });

  it("names a chainid we do not support", () => {
    expect(parse(`https://etherscan.io/token/${USDC_ETH}?chainid=137`)).toMatchObject({
      kind: "unsupported_chain",
    });
  });
});

describe("routing through the classifier", () => {
  it("sends a dexscreener link to the resolver, not to the phishing check", () => {
    const result = normalizeInput(`https://dexscreener.com/base/${PAIR}`);
    expect(result.kind).toBe("link_target");
    expect(result.target?.kind).toBe("ambiguous");
  });

  it("turns an explorer link straight into an address to check", () => {
    const result = normalizeInput(`https://basescan.org/token/${USDC_BASE}`);
    expect(result).toMatchObject({ kind: "evm_address", address: USDC_BASE, chainHint: "base" });
  });

  it("leaves a bare address exactly as it was", () => {
    const result = normalizeInput(USDC_BASE);
    expect(result).toMatchObject({ kind: "evm_address", address: USDC_BASE });
    expect(result.target).toBeUndefined();
  });

  it("still sends a plain website to the site check", () => {
    const result = normalizeInput("https://example.com/claim");
    expect(result.kind).toBe("url");
    expect(result.domain).toBe("example.com");
  });

  it("still rejects a string that is not a link at all", () => {
    expect(normalizeInput("asdf1234").kind).toBe("unrecognized");
  });
});

describe("guidance instead of a dead end", () => {
  it("tells the user what to paste when nothing resolved", () => {
    const { message } = linkGuidance({ kind: "unresolved", via: "dexscreener" });
    expect(message).toBe(
      "We couldn't find a token in that. Paste the link from where you saw the coin, or its contract address.",
    );
  });

  it("names the chain it cannot check", () => {
    const { message } = linkGuidance({
      kind: "unsupported_chain",
      chainName: "Solana",
      via: "dexscreener",
    });
    expect(message).toContain("Solana");
    expect(message).toContain("Celo, Base, Ethereum, and BNB Chain");
  });

  it("explains the pair case specifically", () => {
    const { message, hint } = linkGuidance({ kind: "pair", via: "dextools" });
    expect(message).toContain("couldn't find a token");
    expect(hint).toContain("trading pair");
  });

  it("never produces a verdict word", () => {
    const targets: LinkTarget[] = [
      { kind: "unresolved", via: "dexscreener" },
      { kind: "pair", via: "dextools" },
      { kind: "unsupported_chain", chainName: "Tron", via: "dexscreener" },
    ];
    for (const target of targets) {
      const text = JSON.stringify(linkGuidance(target));
      expect(text).not.toMatch(/SAFE|CAUTION|DANGER/);
    }
  });
});
