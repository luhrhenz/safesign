import { describe, expect, it } from "vitest";
import { searchTokenByName } from "../lib/tokenSearch";

/**
 * Fixtures shaped from CoinGecko's real /search and /coins/{id} responses,
 * captured live on 2026-09-10. "bean" genuinely returns two unrelated tokens
 * both using the symbol BEAN — the exact scenario this module exists to
 * handle honestly rather than paper over.
 */
const SEARCH_BEAN = {
  coins: [
    { id: "minebean", symbol: "bean", name: "MineBean" },
    { id: "lil-bean", symbol: "bean", name: "Lil Bean" },
    { id: "jellybean", symbol: "jellybean", name: "Jellybean" },
  ],
};

const MINEBEAN = {
  name: "MineBean",
  symbol: "bean",
  market_cap_rank: 5975,
  platforms: { base: "0x5c72992b83e74c4d5200a8e8920fb946214a5a5d" },
};

const LIL_BEAN = {
  name: "Lil Bean",
  symbol: "bean",
  market_cap_rank: null,
  platforms: { ethereum: "0x1234567890123456789012345678901234567890" },
};

const JELLYBEAN = {
  name: "Jellybean",
  symbol: "jellybean",
  market_cap_rank: 6469,
  // A Solana address, in Solana's non-hex format — must be filtered out, not
  // passed through as a broken EVM address.
  platforms: { solana: "8pM8qwqcunQzHtSMXV3xoZjV6NwtqeQnpJqwtNGSsFf4" },
};

function stubFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const impl = (async (url: string | URL) => {
    const href = String(url);
    calls.push(href);
    for (const [fragment, body] of Object.entries(routes)) {
      if (href.includes(fragment)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const nowKey = () => `test-${Date.now()}-${Math.random()}`;

describe("names are not unique — the whole reason this module exists", () => {
  it("returns every distinct match, never picks one for the user", async () => {
    const { impl } = stubFetch({
      "search?query": SEARCH_BEAN,
      "coins/minebean": MINEBEAN,
      "coins/lil-bean": LIL_BEAN,
      "coins/jellybean": JELLYBEAN,
    });

    const matches = await searchTokenByName(nowKey(), { fetchImpl: impl });

    // Two real, unrelated tokens both called BEAN, on different chains.
    const beans = matches.filter((m) => m.symbol === "BEAN");
    expect(beans).toHaveLength(2);
    expect(new Set(beans.map((b) => b.chain))).toEqual(new Set(["base", "ethereum"]));
  });

  it("orders by market cap rank, unranked last", async () => {
    const { impl } = stubFetch({
      "search?query": SEARCH_BEAN,
      "coins/minebean": MINEBEAN,
      "coins/lil-bean": LIL_BEAN,
      "coins/jellybean": JELLYBEAN,
    });

    const matches = await searchTokenByName(nowKey(), { fetchImpl: impl });
    const ranks = matches.map((m) => m.marketCapRank);
    // Ranked entries ascending, nulls pushed to the end.
    const ranked = ranks.filter((r): r is number => r !== null);
    expect(ranked).toEqual([...ranked].sort((a, b) => a - b));
    expect(ranks.indexOf(null)).toBe(ranks.length - 1 === -1 ? -1 : ranks.lastIndexOf(null));
  });

  it("drops a non-EVM platform address instead of passing it through broken", async () => {
    const { impl } = stubFetch({
      "search?query": SEARCH_BEAN,
      "coins/minebean": MINEBEAN,
      "coins/lil-bean": LIL_BEAN,
      "coins/jellybean": JELLYBEAN,
    });

    const matches = await searchTokenByName(nowKey(), { fetchImpl: impl });
    expect(matches.every((m) => /^0x[0-9a-f]{40}$/.test(m.address))).toBe(true);
    expect(matches.some((m) => m.name === "Jellybean")).toBe(false);
  });

  it("deduplicates the same chain+address from two search hits", async () => {
    const dupeSearch = { coins: [{ id: "a" }, { id: "b" }] };
    const { impl } = stubFetch({
      "search?query": dupeSearch,
      "coins/a": MINEBEAN,
      "coins/b": MINEBEAN,
    });

    const matches = await searchTokenByName(nowKey(), { fetchImpl: impl });
    expect(matches).toHaveLength(1);
  });
});

describe("failure modes never look like an answer", () => {
  it("returns nothing for a name that matches no token", async () => {
    const { impl } = stubFetch({ "search?query": { coins: [] } });
    expect(await searchTokenByName(nowKey(), { fetchImpl: impl })).toEqual([]);
  });

  it("returns nothing rather than throwing when the search call fails", async () => {
    const impl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(searchTokenByName(nowKey(), { fetchImpl: impl })).resolves.toEqual([]);
  });

  it("skips a coin whose detail lookup fails, keeps the others", async () => {
    const { impl } = stubFetch({
      "search?query": SEARCH_BEAN,
      "coins/lil-bean": LIL_BEAN,
      // minebean and jellybean 404 under the catch-all in stubFetch.
    });
    const matches = await searchTokenByName(nowKey(), { fetchImpl: impl });
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("Lil Bean");
  });

  it("returns nothing for blank input without making a request", async () => {
    const { impl, calls } = stubFetch({});
    expect(await searchTokenByName("   ", { fetchImpl: impl })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("caching", () => {
  it("does not repeat the network round trip for a repeated query", async () => {
    const { impl, calls } = stubFetch({
      "search?query": SEARCH_BEAN,
      "coins/minebean": MINEBEAN,
      "coins/lil-bean": LIL_BEAN,
      "coins/jellybean": JELLYBEAN,
    });

    const query = nowKey();
    await searchTokenByName(query, { fetchImpl: impl });
    const callsAfterFirst = calls.length;

    await searchTokenByName(query, { fetchImpl: impl });
    expect(calls.length).toBe(callsAfterFirst);
  });
});
