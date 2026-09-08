/**
 * Source retrieval, one seam, several providers.
 *
 * Providers are tried in PROVIDER_ORDER until one answers with source. Every
 * provider is optional: one being down, keyless, or not covering a chain is a
 * normal outcome, never an error the user sees.
 *
 * Shapes below were confirmed against the live APIs on 2026-09-08:
 *   - Sourcify v2 (https://sourcify.dev/server/api-docs/swagger.json):
 *     `match` / `creationMatch` / `runtimeMatch` are one of "exact_match",
 *     "match" (partial) or null; `sources` is { path: { content } };
 *     `compilation` carries name/compilerVersion; 404 when not verified.
 *   - Blockscout Celo (https://celo.blockscout.com/api/v2/smart-contracts/…):
 *     `source_code` plus `additional_sources[{file_path, source_code}]`,
 *     `is_verified`, `is_fully_verified`, `is_partially_verified`;
 *     404 {"message":"Not found"} when unknown.
 *   - Etherscan V2 multichain, one key for every chain we support.
 */

import type { AbiFragment } from "./types";

export type SourceProvider = "sourcify" | "etherscan" | "blockscout";
export type SourceConfidence = "high" | "medium";

/**
 * Try order. Sourcify is primary because it needs no key. Moving "etherscan"
 * to the front is the one-line change that makes it preferred once a key exists.
 */
export const PROVIDER_ORDER: SourceProvider[] = ["sourcify", "etherscan", "blockscout"];

export interface SourceProvenance {
  provider: SourceProvider;
  confidence: SourceConfidence;
  /** The provider's own term, kept verbatim: "exact_match", "partial", … */
  matchType: string;
}

export interface SourceFound extends SourceProvenance {
  found: true;
  source: string;
  contractName: string;
  compilerVersion: string;
  abi: AbiFragment[] | null;
}

export type AttemptOutcome = "not_found" | "skipped" | "error";

export interface SourceAttempt {
  provider: SourceProvider;
  outcome: AttemptOutcome;
  /** Why it was skipped or what went wrong. Never contains a key. */
  detail?: string;
}

export interface SourceNotFound {
  found: false;
  attempts: SourceAttempt[];
  /**
   * True when no provider gave a clean answer — every one errored or was
   * skipped. "We could not check" rather than "this is not verified".
   */
  inconclusive: boolean;
}

export type SourceResult = SourceFound | SourceNotFound;

export interface FetchSourceDeps {
  fetchImpl?: typeof fetch;
  /** Defaults to the environment. Tests pass it explicitly. */
  etherscanKey?: string | null;
  timeoutMs?: number;
}

export async function fetchSource(
  chainId: number,
  address: string,
  deps: FetchSourceDeps = {},
): Promise<SourceResult> {
  const attempts: SourceAttempt[] = [];

  for (const provider of PROVIDER_ORDER) {
    const result = await tryProvider(provider, chainId, address, deps);
    if (result.found) return result;
    attempts.push(...result.attempts);
  }

  return {
    found: false,
    attempts,
    // A clean "not verified" from any provider is a real answer about the
    // contract. All-skipped or all-errored is only an answer about us.
    inconclusive: !attempts.some((a) => a.outcome === "not_found"),
  };
}

async function tryProvider(
  provider: SourceProvider,
  chainId: number,
  address: string,
  deps: FetchSourceDeps,
): Promise<SourceResult> {
  switch (provider) {
    case "sourcify":
      return fromSourcify(chainId, address, deps);
    case "etherscan":
      return fromEtherscan(chainId, address, deps);
    case "blockscout":
      return fromBlockscout(chainId, address, deps);
  }
}

/* ------------------------------------------------------------------ Sourcify */

const SOURCIFY_BASE = "https://sourcify.dev/server/v2/contract";

async function fromSourcify(
  chainId: number,
  address: string,
  deps: FetchSourceDeps,
): Promise<SourceResult> {
  const url = `${SOURCIFY_BASE}/${chainId}/${address}?fields=all`;

  try {
    const res = await request(url, {}, deps);
    if (res.status === 404) return miss("sourcify", "not_found");
    if (!res.ok) return miss("sourcify", "error", `HTTP ${res.status}`);

    const body = await res.json();
    const parsed = parseSourcify(body);
    return parsed ?? miss("sourcify", "not_found", "no source in response");
  } catch (err) {
    return miss("sourcify", "error", message(err));
  }
}

interface SourcifyBody {
  match?: string | null;
  creationMatch?: string | null;
  runtimeMatch?: string | null;
  sources?: Record<string, { content?: string }>;
  compilation?: { name?: string; compilerVersion?: string };
  abi?: AbiFragment[];
}

/**
 * "exact_match" is a byte-for-byte match including metadata; "match" is
 * Sourcify's partial match, where the code matches but the metadata hash does
 * not — the same logic, possibly compiled from slightly different files.
 */
export function parseSourcify(body: SourcifyBody): SourceFound | null {
  const matchType = body?.match ?? body?.runtimeMatch ?? body?.creationMatch;
  if (!matchType) return null;

  const source = flattenSourcifySources(body.sources);
  if (!source) return null;

  return {
    found: true,
    provider: "sourcify",
    confidence: matchType === "exact_match" ? "high" : "medium",
    matchType,
    source,
    contractName: body.compilation?.name ?? "",
    compilerVersion: body.compilation?.compilerVersion ?? "",
    abi: Array.isArray(body.abi) ? body.abi : null,
  };
}

function flattenSourcifySources(sources?: Record<string, { content?: string }>): string {
  if (!sources) return "";
  return Object.entries(sources)
    .map(([path, file]) =>
      typeof file?.content === "string" ? `// ==== ${path} ====\n${file.content}` : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

/* ----------------------------------------------------------------- Etherscan */

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

async function fromEtherscan(
  chainId: number,
  address: string,
  deps: FetchSourceDeps,
): Promise<SourceResult> {
  const key = deps.etherscanKey === undefined ? process.env.ETHERSCAN_API_KEY : deps.etherscanKey;

  // Dormant until a key exists. Silent on purpose: a missing key is a
  // configuration state, not a fault, and never reaches the user.
  if (!key) return miss("etherscan", "skipped", "no key configured");

  const url =
    `${ETHERSCAN_V2}?chainid=${chainId}` +
    `&module=contract&action=getsourcecode&address=${address}&apikey=${key}`;

  try {
    const res = await request(url, {}, deps);
    if (!res.ok) return miss("etherscan", "error", `HTTP ${res.status}`);

    const body = await res.json();
    if (body?.status !== "1" || !Array.isArray(body.result)) {
      return miss("etherscan", "error", "explorer returned no result");
    }

    const parsed = parseEtherscan(body.result[0]);
    return parsed ?? miss("etherscan", "not_found");
  } catch (err) {
    return miss("etherscan", "error", message(err));
  }
}

interface EtherscanEntry {
  SourceCode?: string;
  ContractName?: string;
  CompilerVersion?: string;
  ABI?: string;
}

export function parseEtherscan(entry?: EtherscanEntry): SourceFound | null {
  const source = flattenEtherscanSource(entry?.SourceCode ?? "");
  if (!source.trim()) return null;

  return {
    found: true,
    provider: "etherscan",
    confidence: "high",
    matchType: "verified",
    source,
    contractName: entry?.ContractName ?? "",
    compilerVersion: entry?.CompilerVersion ?? "",
    abi: parseAbiString(entry?.ABI),
  };
}

/**
 * Etherscan returns raw Solidity, a standard-json input wrapped in an extra
 * pair of braces, or a bare {path: {content}} map. Flatten all three.
 */
export function flattenEtherscanSource(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("{")) return trimmed;

  const unwrapped = trimmed.startsWith("{{") ? trimmed.slice(1, -1) : trimmed;

  try {
    const parsed = JSON.parse(unwrapped);
    const sources = parsed.sources ?? parsed;
    if (typeof sources !== "object" || sources === null) return trimmed;

    return Object.entries(sources)
      .map(([path, file]) => {
        const content = (file as { content?: string })?.content;
        return typeof content === "string" ? `// ==== ${path} ====\n${content}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return trimmed;
  }
}

/* ---------------------------------------------------------------- Blockscout */

/** Keyless, and only where we have confirmed an instance. */
const BLOCKSCOUT_HOSTS: Record<number, string> = {
  42220: "https://celo.blockscout.com",
};

async function fromBlockscout(
  chainId: number,
  address: string,
  deps: FetchSourceDeps,
): Promise<SourceResult> {
  const host = BLOCKSCOUT_HOSTS[chainId];
  if (!host) return miss("blockscout", "skipped", `no instance for chain ${chainId}`);

  try {
    const res = await request(`${host}/api/v2/smart-contracts/${address}`, {}, deps);
    if (res.status === 404) return miss("blockscout", "not_found");
    if (!res.ok) return miss("blockscout", "error", `HTTP ${res.status}`);

    const parsed = parseBlockscout(await res.json());
    return parsed ?? miss("blockscout", "not_found");
  } catch (err) {
    return miss("blockscout", "error", message(err));
  }
}

interface BlockscoutBody {
  name?: string;
  is_verified?: boolean;
  is_fully_verified?: boolean;
  is_partially_verified?: boolean;
  compiler_version?: string;
  file_path?: string;
  source_code?: string;
  additional_sources?: { file_path?: string; source_code?: string }[];
  abi?: AbiFragment[];
}

export function parseBlockscout(body: BlockscoutBody): SourceFound | null {
  if (!body?.is_verified || !body.source_code?.trim()) return null;

  const files = [
    { file_path: body.file_path ?? "main.sol", source_code: body.source_code },
    ...(body.additional_sources ?? []),
  ];

  const source = files
    .map((f) =>
      f.source_code ? `// ==== ${f.file_path ?? "source.sol"} ====\n${f.source_code}` : "",
    )
    .filter(Boolean)
    .join("\n\n");

  const partial = body.is_partially_verified === true || body.is_fully_verified === false;

  return {
    found: true,
    provider: "blockscout",
    confidence: partial ? "medium" : "high",
    matchType: partial ? "partial" : "full",
    source,
    contractName: body.name ?? "",
    compilerVersion: body.compiler_version ?? "",
    abi: Array.isArray(body.abi) ? body.abi : null,
  };
}

/* --------------------------------------------------------------------- utils */

function miss(provider: SourceProvider, outcome: AttemptOutcome, detail?: string): SourceNotFound {
  return { found: false, attempts: [{ provider, outcome, detail }], inconclusive: false };
}

function request(url: string, init: RequestInit, deps: FetchSourceDeps): Promise<Response> {
  const doFetch = deps.fetchImpl ?? fetch;
  return doFetch(url, { ...init, signal: AbortSignal.timeout(deps.timeoutMs ?? 12_000) });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "request failed";
}

function parseAbiString(raw: unknown): AbiFragment[] | null {
  if (typeof raw !== "string" || raw.startsWith("Contract source code not verified")) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AbiFragment[]) : null;
  } catch {
    return null;
  }
}
