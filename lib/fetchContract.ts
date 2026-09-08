/**
 * Step 2 of the pipeline: everything we know about an address.
 *
 * Two independent halves, on purpose:
 *   - source, from whichever provider answers first (lib/fetchSource.ts)
 *   - on-chain facts, always read straight from a public RPC node
 *
 * They must stay independent. The proxy and owner reads are what let us say
 * something useful about a contract nobody has published source for, and they
 * caught a real case Sourcify's own proxy resolver misses: cUSD on Celo reports
 * `proxyResolution.isProxy: false` there, while its EIP-1967 slot is populated.
 */

import { CHAINS, ChainKey } from "./chains";
import { fetchSource, type SourceAttempt, type SourceProvenance } from "./fetchSource";
import { callSelector, rpcCall, wordToAddress } from "./rpc";
import type { AbiFragment } from "./types";

/** keccak256("owner()") and keccak256("implementation()"), first 4 bytes. */
const SELECTOR_OWNER = "0x8da5cb5b";
const SELECTOR_IMPLEMENTATION = "0x5c60da1b";

/** EIP-1967 implementation slot. */
const SLOT_IMPLEMENTATION =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export interface ContractData {
  address: string;
  chain: ChainKey;
  verified: boolean;
  source: string;
  contractName: string;
  abi: AbiFragment[] | null;
  compilerVersion: string;
  /** Which provider answered, and how confident we are in the match. */
  provenance: SourceProvenance | null;
  /** What each provider did. Useful in logs; never shown to a user. */
  sourceAttempts: SourceAttempt[];
  /**
   * True when no provider could give a clean answer. Distinct from "this
   * contract is not verified", which is a fact about the contract.
   */
  sourceLookupInconclusive: boolean;
  bytecode: string;
  owner: string | null;
  ownerIsContract: boolean | null;
  proxy: { isProxy: boolean; implementation: string | null };
}

export async function fetchContract(
  address: string,
  chain: ChainKey,
): Promise<ContractData> {
  // One wave of network calls, not three: on a slow connection every extra
  // round trip is felt.
  const [source, bytecode, onchain] = await Promise.all([
    fetchSource(CHAINS[chain].chainId, address),
    rpcCall(CHAINS[chain].rpcs, "eth_getCode", [address, "latest"]),
    fetchOnchainFacts(address, chain),
  ]);

  return {
    address,
    chain,
    verified: source.found,
    source: source.found ? source.source : "",
    contractName: source.found ? source.contractName : "",
    abi: source.found ? source.abi : null,
    compilerVersion: source.found ? source.compilerVersion : "",
    provenance: source.found
      ? { provider: source.provider, confidence: source.confidence, matchType: source.matchType }
      : null,
    sourceAttempts: source.found ? [] : source.attempts,
    sourceLookupInconclusive: source.found ? false : source.inconclusive,
    bytecode: bytecode ?? "0x",
    owner: onchain.owner,
    ownerIsContract: onchain.ownerIsContract,
    proxy: {
      isProxy: onchain.implementation !== null,
      implementation: onchain.implementation,
    },
  };
}

/** Keyless, public-node reads. Independent of whoever supplied the source. */
async function fetchOnchainFacts(address: string, chain: ChainKey) {
  const rpcs = CHAINS[chain].rpcs;

  const [ownerWord, implSlot, implCall] = await Promise.all([
    callSelector(rpcs, address, SELECTOR_OWNER),
    rpcCall(rpcs, "eth_getStorageAt", [address, SLOT_IMPLEMENTATION, "latest"]),
    callSelector(rpcs, address, SELECTOR_IMPLEMENTATION),
  ]);

  const owner = wordToAddress(ownerWord);
  const implementation = wordToAddress(implSlot) ?? wordToAddress(implCall);

  let ownerIsContract: boolean | null = null;
  if (owner) {
    const ownerCode = await rpcCall(rpcs, "eth_getCode", [owner, "latest"]);
    if (ownerCode !== null) ownerIsContract = ownerCode !== "0x" && ownerCode.length > 2;
  }

  return { owner, ownerIsContract, implementation };
}
