/**
 * Chain detection + explorer/RPC config.
 *
 * Etherscan's V2 multichain API serves every chain we support from one host
 * with one API key (verified 2026-09-08 against https://api.etherscan.io/v2/chainlist).
 */

import { rpcCall } from "./rpc";

export type ChainKey = "celo" | "base" | "ethereum" | "bsc";

export interface ChainConfig {
  key: ChainKey;
  chainId: number;
  label: string;
  /** Public RPCs, tried in order. */
  rpcs: string[];
  explorerUrl: string;
}

/**
 * Order matters: it is the probe order for a bare address. Celo comes first
 * because that is where our users are (MiniPay).
 */
export const CHAINS: Record<ChainKey, ChainConfig> = {
  celo: {
    key: "celo",
    chainId: 42220,
    label: "Celo",
    rpcs: ["https://forno.celo.org", "https://celo-rpc.publicnode.com"],
    explorerUrl: "https://celoscan.io",
  },
  base: {
    key: "base",
    chainId: 8453,
    label: "Base",
    rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
    explorerUrl: "https://basescan.org",
  },
  ethereum: {
    key: "ethereum",
    chainId: 1,
    label: "Ethereum",
    rpcs: ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"],
    explorerUrl: "https://etherscan.io",
  },
  bsc: {
    key: "bsc",
    chainId: 56,
    label: "BNB Chain",
    rpcs: ["https://bsc-dataseed.binance.org", "https://bsc-rpc.publicnode.com"],
    explorerUrl: "https://bscscan.com",
  },
};

export const CHAIN_ORDER: ChainKey[] = ["celo", "base", "ethereum", "bsc"];

/** Explorer hostnames and EIP-3770 short names that tell us the chain outright. */
const HOST_HINTS: Record<string, ChainKey> = {
  "celoscan.io": "celo",
  "explorer.celo.org": "celo",
  "basescan.org": "base",
  "etherscan.io": "ethereum",
  "bscscan.com": "bsc",
};

const PREFIX_HINTS: Record<string, ChainKey> = {
  celo: "celo",
  base: "base",
  eth: "ethereum",
  ethereum: "ethereum",
  bnb: "bsc",
  bsc: "bsc",
};

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

export interface NormalizedInput {
  /** "address" — we have something to analyse on chain. "link" — a URL with no address in it. */
  kind: "address" | "link" | "unknown";
  address?: string;
  /** Chain we could read straight off the input (explorer host, eip-3770 prefix). */
  chainHint?: ChainKey;
  /** Hostname, when the user pasted a link. */
  domain?: string;
}

/**
 * Step 1 of the pipeline: work out what the user actually pasted.
 * Accepts a bare address, "celo:0x…", an explorer URL, or any dApp link that
 * carries an address in its path or query string.
 */
export function normalizeInput(raw: string): NormalizedInput {
  const input = raw.trim();
  if (!input) return { kind: "unknown" };

  // Bare address, or an EIP-3770 / EIP-681 prefixed one ("celo:0x…").
  const prefixed = /^([a-zA-Z]+):(0x[a-fA-F0-9]{40})/.exec(input);
  if (prefixed) {
    return {
      kind: "address",
      address: prefixed[2].toLowerCase(),
      chainHint: PREFIX_HINTS[prefixed[1].toLowerCase()],
    };
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(input)) {
    return { kind: "address", address: input.toLowerCase() };
  }

  // Anything else that looks like a link.
  const url = parseUrl(input);
  if (url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const chainHint = HOST_HINTS[host] ?? HOST_HINTS[host.split(".").slice(-2).join(".")];
    const found = ADDRESS_RE.exec(url.pathname + url.search);
    return found
      ? { kind: "address", address: found[0].toLowerCase(), chainHint, domain: host }
      : { kind: "link", chainHint, domain: host };
  }

  // Last resort: an address buried in pasted text.
  const loose = ADDRESS_RE.exec(input);
  return loose ? { kind: "address", address: loose[0].toLowerCase() } : { kind: "unknown" };
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
}

export interface ChainDetection {
  chain: ChainKey | null;
  /** True when the address exists but has no code on any chain we checked. */
  isEoa: boolean;
}

/**
 * Find the chain an address actually lives on by asking each chain whether it
 * holds code there. A hint from the input is checked first.
 */
export async function detectChain(
  address: string,
  hint?: ChainKey,
): Promise<ChainDetection> {
  // A hint is usually right, and checking it alone is one round trip.
  if (hint) {
    const code = await rpcCall(CHAINS[hint].rpcs, "eth_getCode", [address, "latest"]);
    if (hasCode(code)) return { chain: hint, isEoa: false };
  }

  // Otherwise ask every chain at once. Four calls in one wave beat four waves
  // of one — on a slow connection the difference is seconds, not milliseconds.
  const remaining = CHAIN_ORDER.filter((key) => key !== hint);
  const results = await Promise.all(
    remaining.map((key) => rpcCall(CHAINS[key].rpcs, "eth_getCode", [address, "latest"])),
  );

  // CHAIN_ORDER decides ties: an address deployed on several chains resolves to
  // the one our users are on.
  const found = remaining.findIndex((_, i) => hasCode(results[i]));
  if (found !== -1) return { chain: remaining[found], isEoa: false };

  return { chain: hint ?? null, isEoa: results.some((code) => code !== null) };
}

function hasCode(code: string | null): boolean {
  return code !== null && code !== "0x" && code.length > 2;
}
