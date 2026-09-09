/**
 * Chain detection + explorer/RPC config.
 *
 * Etherscan's V2 multichain API serves every chain we support from one host
 * with one API key (verified 2026-09-08 against https://api.etherscan.io/v2/chainlist).
 */

import { resolveLink, type LinkTarget } from "./resolveLink";
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

/** Why we could not use the input. Drives which honest message the user sees. */
export type UnrecognizedReason = "stellar" | "generic";

export interface NormalizedInput {
  /**
   * Exactly three outcomes. "unrecognized" routes to no checker at all — the
   * app must never claim to have checked something it could not parse.
   */
  kind: "evm_address" | "url" | "link_target" | "unrecognized";
  /** Lowercased, and only ever set on "evm_address". */
  address?: string;
  /** Chain we could read straight off the input (explorer host, eip-3770 prefix). */
  chainHint?: ChainKey;
  /** Hostname, and only ever set on "url". */
  domain?: string;
  /** Only set on "unrecognized". */
  reason?: UnrecognizedReason;
  /**
   * Only set on "link_target": a link to a site that trades in tokens, which
   * needs resolving (and may turn out to be a pair, or an unsupported chain).
   */
  target?: LinkTarget;
  /** The input exactly as typed. Never normalised, never lowercased. */
  raw: string;
}

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Stellar strkeys: Base32 (RFC 4648, no padding), 56 characters, "C" for a
 * contract and "G" for an account. Detected only so we can say "not supported"
 * clearly — nothing is fetched or analysed. SafeSign is EVM-only.
 */
const STELLAR_STRKEY_RE = /^[CG][A-Z2-7]{55}$/;

/**
 * Step 1 of the pipeline: work out what the user actually pasted.
 *
 * The order matters, and so does the strictness. An earlier version fell
 * through to "treat it as a website" for anything it could not otherwise place,
 * which let a Stellar contract address come back as a reassuring verdict about
 * a site that does not exist. Nothing reaches a checker now unless it is
 * positively identified.
 */
export function normalizeInput(raw: string): NormalizedInput {
  const input = raw.trim();
  if (!input) return { kind: "unrecognized", reason: "generic", raw };

  // 1. An EIP-3770 / EIP-681 prefixed address: "celo:0x…".
  const prefixed = /^([a-zA-Z]+):(0x[a-fA-F0-9]{40})$/.exec(input);
  if (prefixed) {
    return {
      kind: "evm_address",
      address: prefixed[2].toLowerCase(),
      chainHint: PREFIX_HINTS[prefixed[1].toLowerCase()],
      raw,
    };
  }

  // 2. A bare EVM address, checksummed or not.
  if (EVM_ADDRESS_RE.test(input)) {
    return { kind: "evm_address", address: input.toLowerCase(), raw };
  }

  // 3. A real link — and only a real link. A hostname has to have a dot and a
  //    plausible TLD, which is what a 56-character base32 blob does not.
  const url = parseUrl(input);
  if (url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const target = resolveLink(url);

    // A link to an explorer or a token site: the address, the chain, or the
    // reason we cannot use it all come from the link itself.
    if (target.kind === "address") {
      return { kind: "evm_address", address: target.address, chainHint: target.chain, domain: host, raw };
    }
    if (target.kind !== "site") {
      return { kind: "link_target", target, domain: host, raw };
    }

    // Any other site. An address sitting in the query string of a dApp link is
    // still worth using; otherwise this is a website to check for phishing.
    const chainHint = HOST_HINTS[host] ?? HOST_HINTS[host.split(".").slice(-2).join(".")];
    const found = ADDRESS_RE.exec(url.pathname + url.search);
    return found
      ? { kind: "evm_address", address: found[0].toLowerCase(), chainHint, domain: host, raw }
      : { kind: "url", chainHint, domain: host, raw };
  }

  // 4. Not ours. Say so plainly, and leave the input untouched.
  return {
    kind: "unrecognized",
    reason: STELLAR_STRKEY_RE.test(input) ? "stellar" : "generic",
    raw,
  };
}

/**
 * A link we understood but could not turn into something checkable. These are
 * guiding states, not errors: each one tells the user what to paste instead.
 */
export function linkGuidance(target: LinkTarget): { message: string; hint?: string } {
  if (target.kind === "unsupported_chain") {
    return {
      message: `That link points to ${target.chainName}, which SafeSign doesn't check yet. We cover Celo, Base, Ethereum, and BNB Chain.`,
    };
  }

  const message =
    "We couldn't find a token in that. Paste the link from where you saw the coin, or its contract address.";

  return target.kind === "pair"
    ? {
        message,
        hint: "That link is for a trading pair, not a single token. Open the token itself and copy that link.",
      }
    : { message };
}

/** The exact words a user sees when we cannot check their input. */
export function unrecognizedMessage(reason: UnrecognizedReason): string {
  return reason === "stellar"
    ? "That looks like a Stellar address. SafeSign currently checks EVM chains only (Celo, Base, Ethereum, BNB Chain), not Stellar."
    : "This doesn't look like an EVM contract address or a link SafeSign can check. SafeSign checks contracts on Celo, Base, Ethereum, and BNB Chain.";
}

/**
 * A hostname we are willing to call a website: at least two labels, and a last
 * label that reads like a TLD (letters, or a punycode "xn--" label).
 *
 * This is deliberately stricter than `new URL()`, which happily accepts
 * "https://CDLZFC3SYJYDZT7K67VZ…" as a single-label host. Bare IPs fail too —
 * there is nothing useful we could tell a user about one.
 */
function isPlausibleHostname(hostname: string): boolean {
  const labels = hostname.toLowerCase().split(".");
  if (labels.length < 2) return false;
  if (labels.some((label) => label.length === 0)) return false;

  const tld = labels[labels.length - 1];
  return /^[a-z]{2,}$/.test(tld) || /^xn--[a-z0-9-]+$/.test(tld);
}

function parseUrl(input: string): URL | null {
  const isHttp = /^https?:\/\//i.test(input);

  // A scheme is optional, but only http(s) is a website. Anything else —
  // "ftp://", "data:", "mailto:", "tel:" — is not something SafeSign can check.
  // The schemeless ones matter: "mailto:a@example.com" with https:// glued on
  // the front parses as userinfo and yields the host "example.com", which would
  // have us cheerfully checking a website the user never mentioned.
  // A trailing port ("example.com:8080") is not a scheme, hence the digit test.
  const looksSchemed = /^[a-zA-Z][a-zA-Z0-9+.-]*:(\/\/|(?!\d))/.test(input);
  if (looksSchemed && !isHttp) return null;

  const hasScheme = isHttp;

  // Whitespace inside means it is prose, not a link.
  if (/\s/.test(input)) return null;

  try {
    const url = new URL(hasScheme ? input : `https://${input}`);
    return isPlausibleHostname(url.hostname) ? url : null;
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
