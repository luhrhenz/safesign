/**
 * A labelled corpus, so accuracy is a number instead of a feeling.
 *
 * Unit tests prove the rules match strings we wrote. They say nothing about
 * whether the tool is right about real tokens. This is the set we measure
 * against, and the two things it measures are different questions:
 *
 *   LEGITIMATE — tokens millions of people hold. Any DANGER here is a false
 *     alarm, and a false alarm on the token in someone's wallet is how a
 *     safety tool loses the right to be believed.
 *
 *   MALICIOUS — addresses on public drainer lists. The interesting number is
 *     not "did the list catch it" (it did, by definition) but whether the
 *     static rules would have caught it with the list switched off.
 *
 * Every legitimate address below was resolved through the live pipeline and
 * matched against the contract name the chain reports.
 */

import type { ChainKey } from "../chains";

export interface CorpusEntry {
  chain: ChainKey;
  address: string;
  /** What it is, in the words a user would use. */
  label: string;
  /** What the contract calls itself on chain — a guard against a wrong paste. */
  expectName?: string;
}

/**
 * Tokens a MiniPay or DeFi user plausibly holds. Deliberately includes the
 * awkward cases: issuer-controlled stablecoins that can freeze and mint, and
 * upgradeable proxies. Those are exactly where a naive tool cries wolf.
 */
export const LEGITIMATE: CorpusEntry[] = [
  // Celo — what MiniPay actually holds.
  { chain: "celo", address: "0x765de816845861e75a25fca122bb6898b8b1282a", label: "cUSD", expectName: "StableTokenProxy" },
  { chain: "celo", address: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73", label: "cEUR" },
  { chain: "celo", address: "0x471ece3750da237f93b8e339c536989b8978a438", label: "CELO", expectName: "GoldTokenProxy" },
  { chain: "celo", address: "0xe8537a3d056da446677b9e9d6c5db704eaab4787", label: "cREAL" },
  { chain: "celo", address: "0xceba9300f2b948710d2653dd7b07f33a8b32118c", label: "USDC on Celo" },
  { chain: "celo", address: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e", label: "USDT on Celo" },

  // Base.
  { chain: "base", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", label: "USDC on Base", expectName: "FiatTokenProxy" },
  { chain: "base", address: "0x4200000000000000000000000000000000000006", label: "WETH on Base", expectName: "WETH9" },
  { chain: "base", address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", label: "DAI on Base" },
  { chain: "base", address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631", label: "AERO" },
  { chain: "base", address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", label: "cbBTC" },

  // Ethereum.
  { chain: "ethereum", address: "0xdac17f958d2ee523a2206206994597c13d831ec7", label: "USDT", expectName: "TetherToken" },
  { chain: "ethereum", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", label: "USDC", expectName: "FiatTokenProxy" },
  { chain: "ethereum", address: "0x6b175474e89094c44da98b954eedeac495271d0f", label: "DAI", expectName: "Dai" },
  { chain: "ethereum", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", label: "WETH", expectName: "WETH9" },
  { chain: "ethereum", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", label: "WBTC" },
  { chain: "ethereum", address: "0x514910771af9ca656af840dff83e8264ecf986ca", label: "LINK" },
  { chain: "ethereum", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", label: "UNI" },
  { chain: "ethereum", address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", label: "AAVE" },

  // BNB Chain.
  { chain: "bsc", address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", label: "WBNB" },
  { chain: "bsc", address: "0x55d398326f99059ff775485246999027b3197955", label: "USDT on BSC" },
  { chain: "bsc", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", label: "USDC on BSC" },
  { chain: "bsc", address: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", label: "CAKE" },
  { chain: "bsc", address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", label: "BUSD" },
];

/**
 * How many malicious addresses to sample from the live drainer list. Kept
 * modest: each one costs a source lookup and several RPC calls.
 */
export const MALICIOUS_SAMPLE_SIZE = 20;
