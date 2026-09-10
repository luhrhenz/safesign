/**
 * Finding a token by the only thing most people actually have: its name.
 *
 * A contract address is a developer's artefact. The person who needs SafeSign
 * most has a name someone told them — "BeanToken" — and no idea an address
 * even exists. Without this, the entire tool is unreachable to exactly the
 * people it was built for.
 *
 * The one fact that makes this dangerous to build carelessly: **names are not
 * unique.** Searching CoinGecko for "bean" on 2026-09-10 returned two
 * different tokens both using the symbol BEAN, on different chains, with
 * different contracts. Anyone can deploy a token called whatever they like —
 * copying the name of something popular is a standard scam move. So this
 * module never resolves a name to a single address. It returns candidates,
 * every time, even when there is only one, and the UI makes the user pick.
 * The trust boundary stays exactly where it already was: CoinGecko is a
 * search index for convenience, not a source of truth — the verdict still
 * comes from reading the chosen contract itself, same as a pasted address.
 *
 * Chain slugs confirmed live against CoinGecko's own /asset_platforms and
 * cross-checked on a token already in our own corpus (USDC's Celo address
 * matched byte for byte): "ethereum", "base", "binance-smart-chain", "celo".
 */

import { getCached, setCached } from "./cache";
import type { ChainKey } from "./chains";
import { CHAINS } from "./chains";

const CG_CHAIN: Record<string, ChainKey> = {
  ethereum: "ethereum",
  base: "base",
  "binance-smart-chain": "bsc",
  celo: "celo",
};

export interface TokenMatch {
  name: string;
  symbol: string;
  chain: ChainKey;
  chainLabel: string;
  address: string;
  /** CoinGecko's market cap rank. Not a safety signal — a low rank is not a
   *  red flag, plenty of legitimate tokens are small — but worth showing. */
  marketCapRank: number | null;
}

const SEARCH_TTL_SECONDS = 6 * 60 * 60;
/** How many of the raw search hits are worth the extra lookup each costs. */
const MAX_CANDIDATES = 6;

export interface SearchDeps {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function searchTokenByName(
  rawQuery: string,
  deps: SearchDeps = {},
): Promise<TokenMatch[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  const cacheKey = `safesign:v1:namesearch:${query.toLowerCase()}`;
  const cached = await getCached<TokenMatch[]>(cacheKey);
  if (cached) return cached;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 8000;

  let ids: string[];
  try {
    const res = await fetchImpl(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!res.ok) return [];
    const body = await res.json();
    ids = Array.isArray(body?.coins)
      ? body.coins.slice(0, MAX_CANDIDATES).map((c: { id?: string }) => c.id).filter(Boolean)
      : [];
  } catch {
    return [];
  }

  if (ids.length === 0) return [];

  const details = await Promise.allSettled(
    ids.map((id) => fetchCoinDetail(id, fetchImpl, timeoutMs)),
  );

  const matches: TokenMatch[] = [];
  const seen = new Set<string>();

  for (const result of details) {
    if (result.status !== "fulfilled" || !result.value) continue;
    for (const match of result.value) {
      const dedupeKey = `${match.chain}:${match.address}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      matches.push(match);
    }
  }

  matches.sort((a, b) => (a.marketCapRank ?? Infinity) - (b.marketCapRank ?? Infinity));

  await setCached(cacheKey, matches, SEARCH_TTL_SECONDS);
  return matches;
}

interface CoinDetail {
  name?: string;
  symbol?: string;
  market_cap_rank?: number | null;
  platforms?: Record<string, string>;
}

async function fetchCoinDetail(
  id: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<TokenMatch[] | null> {
  try {
    const res = await fetchImpl(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}` +
        "?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false",
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!res.ok) return null;

    const body: CoinDetail = await res.json();
    const platforms = body.platforms ?? {};
    const out: TokenMatch[] = [];

    for (const [cgChain, address] of Object.entries(platforms)) {
      const chain = CG_CHAIN[cgChain];
      // Bare addresses (no 0x) show up for non-EVM platforms; skip anything
      // that isn't one of our four chains or isn't a real EVM address.
      if (!chain || !address || !/^0x[a-fA-F0-9]{40}$/.test(address)) continue;

      out.push({
        name: body.name ?? id,
        symbol: (body.symbol ?? "").toUpperCase(),
        chain,
        chainLabel: CHAINS[chain].label,
        address: address.toLowerCase(),
        marketCapRank: body.market_cap_rank ?? null,
      });
    }

    return out;
  } catch {
    return null;
  }
}
