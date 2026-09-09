/**
 * Turning a pasted link into something checkable.
 *
 * Nobody outside a dev team copies a contract address. They copy the link from
 * wherever they saw the coin — a DEX page, an explorer, a token page. This is
 * the step that makes those work.
 *
 * URL shapes were confirmed live on 2026-09-08, not assumed:
 *   - Dexscreener's own API returns the canonical web URL as
 *     `https://dexscreener.com/{chainSlug}/{pairAddress}` — the address in a
 *     dexscreener link is a PAIR, not necessarily a token. Its chain slugs are
 *     `ethereum`, `base`, `bsc`, `celo` (verified against
 *     api.dexscreener.com/token-pairs/v1/{slug}/…; `eth` is not a slug).
 *   - Dextools serves `/app/[lang/]{chainSlug}/token-explorer/{tokenAddress}`
 *     and `/app/[lang/]{chainSlug}/pair-explorer/{pairAddress}` (both 200, the
 *     language segment is optional). Its Ethereum slug is `ether`.
 *
 * The pair/token distinction matters: analysing a liquidity pair and reporting
 * it as "the token" would be a confident wrong answer, which is the one thing
 * this app must not produce.
 */

import { getCached, pairCacheKey, setCached } from "./cache";
import { CHAINS, type ChainKey } from "./chains";
import { callSelector } from "./rpc";

/** Chain slugs as other sites spell them, mapped to ours. */
const CHAIN_SLUGS: Record<string, ChainKey> = {
  ethereum: "ethereum",
  eth: "ethereum",
  ether: "ethereum",
  mainnet: "ethereum",
  base: "base",
  bsc: "bsc",
  bnb: "bsc",
  bnbchain: "bsc",
  "bnb-chain": "bsc",
  binance: "bsc",
  "binance-smart-chain": "bsc",
  celo: "celo",
};

/**
 * Chains we can name but do not check. Naming them is the difference between
 * "that doesn't work" and "that's Solana, we do EVM" — one of those tells the
 * user what to do next.
 */
const KNOWN_OTHER_CHAINS: Record<string, string> = {
  solana: "Solana",
  sol: "Solana",
  tron: "Tron",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  avalanche: "Avalanche",
  avax: "Avalanche",
  fantom: "Fantom",
  cronos: "Cronos",
  linea: "Linea",
  scroll: "Scroll",
  zksync: "zkSync",
  blast: "Blast",
  mantle: "Mantle",
  sonic: "Sonic",
  pulsechain: "PulseChain",
  hyperevm: "HyperEVM",
  sui: "Sui",
  aptos: "Aptos",
  ton: "TON",
  near: "NEAR",
  cardano: "Cardano",
};

/** Explorers, where the chain is the domain and the address is the path. */
const EXPLORER_CHAINS: Record<string, ChainKey> = {
  "etherscan.io": "ethereum",
  "basescan.org": "base",
  "bscscan.com": "bsc",
  "celoscan.io": "celo",
  "explorer.celo.org": "celo",
};

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

export type LinkTarget =
  /** A contract address we can check, and the chain it is on. */
  | { kind: "address"; chain: ChainKey; address: string; via: string }
  /** A dexscreener link: the address is a pair or a token, only chain data tells us which. */
  | { kind: "ambiguous"; chain: ChainKey; address: string; via: string }
  /** Definitely a trading pair — there is no single token to report on. */
  | { kind: "pair"; via: string }
  /** A token site we understand, on a chain we do not check. */
  | { kind: "unsupported_chain"; chainName: string; via: string }
  /** A token site we understand, but nothing checkable in the link. */
  | { kind: "unresolved"; via: string }
  /** Not a token site at all — this is just a website. */
  | { kind: "site" };

/**
 * The pure half: everything that can be decided from the URL alone.
 */
export function resolveLink(url: URL): LinkTarget {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  const explorerChain = EXPLORER_CHAINS[host];
  if (explorerChain) return fromExplorer(url, segments, explorerChain);

  if (host === "dexscreener.com") return fromDexscreener(segments);
  if (host === "dextools.io") return fromDextools(segments);

  return { kind: "site" };
}

/**
 * Explorers: `/address/0x…`, `/token/0x…`, `/nft/0x…`. The chain comes from the
 * domain, unless the V2 multichain `?chainid=` says otherwise.
 */
function fromExplorer(url: URL, segments: string[], hostChain: ChainKey): LinkTarget {
  const found = ADDRESS_RE.exec(url.pathname + url.search);
  if (!found) return { kind: "unresolved", via: "explorer" };

  const chainIdParam = url.searchParams.get("chainid") ?? url.searchParams.get("chainId");
  const chain = chainIdParam ? chainFromId(chainIdParam) : hostChain;

  if (chain === "unsupported") {
    return { kind: "unsupported_chain", chainName: `chain ${chainIdParam}`, via: "explorer" };
  }

  return { kind: "address", chain: chain ?? hostChain, address: found[0].toLowerCase(), via: "explorer" };
}

/** Dexscreener: `/{chainSlug}/{address}` — and that address may be a pair. */
function fromDexscreener(segments: string[]): LinkTarget {
  const [slug, maybeAddress] = segments;
  if (!slug) return { kind: "unresolved", via: "dexscreener" };

  const chain = CHAIN_SLUGS[slug.toLowerCase()];
  if (!chain) {
    const name = KNOWN_OTHER_CHAINS[slug.toLowerCase()];
    return name
      ? { kind: "unsupported_chain", chainName: name, via: "dexscreener" }
      : { kind: "unresolved", via: "dexscreener" };
  }

  if (!maybeAddress || !ADDRESS_RE.test(maybeAddress)) {
    return { kind: "unresolved", via: "dexscreener" };
  }

  // Their canonical link is a pair, but a token address in the same slot also
  // works, so the URL alone cannot tell us. Settled on chain, not by guessing.
  return { kind: "ambiguous", chain, address: maybeAddress.toLowerCase(), via: "dexscreener" };
}

/** Dextools: `/app/[lang/]{chainSlug}/{token|pair}-explorer/{address}`. */
function fromDextools(segments: string[]): LinkTarget {
  const explorerAt = segments.findIndex((s) => /^(token|pair)-explorer$/i.test(s));
  if (explorerAt < 1) return { kind: "unresolved", via: "dextools" };

  const slug = segments[explorerAt - 1].toLowerCase();
  const isPair = segments[explorerAt].toLowerCase() === "pair-explorer";
  const address = segments[explorerAt + 1];

  const chain = CHAIN_SLUGS[slug];
  if (!chain) {
    const name = KNOWN_OTHER_CHAINS[slug];
    return name
      ? { kind: "unsupported_chain", chainName: name, via: "dextools" }
      : { kind: "unresolved", via: "dextools" };
  }

  // A pair page names a pair. There is no single token to report on, and
  // picking one side of it would be a guess.
  if (isPair) return { kind: "pair", via: "dextools" };

  if (!address || !ADDRESS_RE.test(address)) return { kind: "unresolved", via: "dextools" };
  return { kind: "address", chain, address: address.toLowerCase(), via: "dextools" };
}

function chainFromId(raw: string): ChainKey | "unsupported" | null {
  const id = Number(raw);
  if (!Number.isFinite(id)) return null;
  const match = (Object.keys(CHAINS) as ChainKey[]).find((key) => CHAINS[key].chainId === id);
  return match ?? "unsupported";
}

/** keccak256("token0()") — every Uniswap-style pair has it, tokens do not. */
const SELECTOR_TOKEN0 = "0x0dfe1681";

export interface SettleDeps {
  /** Injectable so tests never touch the network. */
  isPair?: (chain: ChainKey, address: string) => Promise<boolean>;
}

/**
 * The impure half: ask the chain whether an ambiguous address is a pair.
 *
 * This is not guessing which token the user meant — it is establishing a fact,
 * and then refusing to answer when the fact is "this is a pair".
 */
export async function settleTarget(
  target: LinkTarget,
  deps: SettleDeps = {},
): Promise<LinkTarget> {
  if (target.kind !== "ambiguous") return target;

  const isPair = deps.isPair ?? looksLikePair;
  try {
    if (await isPair(target.chain, target.address)) {
      return { kind: "pair", via: target.via };
    }
  } catch {
    // If we cannot tell, treat it as the token it is most likely to be. The
    // analysis that follows is honest about whatever it actually finds.
  }

  return { kind: "address", chain: target.chain, address: target.address, via: target.via };
}

/**
 * Cached through the same KV the verdicts use: an address either is a pair or
 * is not, permanently, so the second person to paste the same link pays no
 * network cost at all.
 */
async function looksLikePair(chain: ChainKey, address: string): Promise<boolean> {
  const key = pairCacheKey(chain, address);

  const cached = await getCached<{ isPair: boolean }>(key);
  if (cached) return cached.isPair;

  const result = await callSelector(CHAINS[chain].rpcs, address, SELECTOR_TOKEN0);
  // A token has no token0(); the call reverts and the node returns "0x" or null.
  const isPair = typeof result === "string" && result.length >= 66;

  await setCached(key, { isPair });
  return isPair;
}

export { CHAIN_SLUGS, KNOWN_OTHER_CHAINS };
