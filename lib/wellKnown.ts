/**
 * Tokens most people would recognise.
 *
 * This is a CONTEXT TAG and nothing more. It does not change a verdict, and it
 * is not what stops USDT being called a scam — the verdict tiers do that, and
 * USDT lands correctly whether or not it appears here. All this does is let the
 * card say "widely-used token" next to findings that would otherwise read as
 * alarming out of context.
 *
 * Every address below was resolved through the live pipeline on 2026-09-08 and
 * matched to its expected contract name, so the tag cannot land on the wrong
 * thing.
 */

const WELL_KNOWN: Record<string, Record<string, string>> = {
  ethereum: {
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "TetherToken",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "FiatTokenProxy",
    "0x6b175474e89094c44da98b954eedeac495271d0f": "Dai",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH9",
  },
  base: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "FiatTokenProxy",
    "0x4200000000000000000000000000000000000006": "WETH9",
  },
  celo: {
    "0x765de816845861e75a25fca122bb6898b8b1282a": "StableTokenProxy",
    "0x471ece3750da237f93b8e339c536989b8978a438": "GoldTokenProxy",
  },
  bsc: {
    "0x55d398326f99059ff775485246999027b3197955": "BEP20UpgradeableProxy",
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "FiatTokenProxy",
  },
};

export function isWellKnown(chain: string, address: string): boolean {
  return Boolean(WELL_KNOWN[chain]?.[address.toLowerCase()]);
}
