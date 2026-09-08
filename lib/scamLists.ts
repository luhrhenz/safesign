/**
 * Step 3 of the pipeline: cross-reference against public blocklists.
 *
 * Feeds (verified live 2026-09-08):
 *   - ScamSniffer scam-database — flat array of ~2.5k drainer addresses (~120KB).
 *   - MetaMask eth-phishing-detect — phishing domains under the key `blacklist`
 *     (~97k entries, ~2.7MB) plus a `whitelist` of known-good sites.
 *
 * Both are fetched lazily and cached in module scope, so a warm serverless
 * instance pays the download once. ScamSniffer's domains.json is deliberately
 * not used: it is ~9MB, too heavy for a request path.
 */

const ADDRESS_FEED =
  "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json";
const DOMAIN_FEED =
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface Cache<T> {
  value: T | null;
  fetchedAt: number;
  inflight: Promise<T | null> | null;
}

const addressCache: Cache<Set<string>> = { value: null, fetchedAt: 0, inflight: null };
const domainCache: Cache<DomainLists> = { value: null, fetchedAt: 0, inflight: null };

interface DomainLists {
  blocked: Set<string>;
  allowed: Set<string>;
}

export interface ScamListResult {
  /** The address appears on a known drainer/scam list. */
  addressListed: boolean;
  /** The domain appears on a known phishing list. */
  domainListed: boolean;
  /** The domain is on MetaMask's allowlist of established sites. */
  domainAllowlisted: boolean;
  /** A feed we wanted to consult was unreachable — never claim "clean" then. */
  degraded: boolean;
}

export async function checkScamLists(
  address?: string,
  domain?: string,
): Promise<ScamListResult> {
  const result: ScamListResult = {
    addressListed: false,
    domainListed: false,
    domainAllowlisted: false,
    degraded: false,
  };

  const [addresses, domains] = await Promise.all([
    address ? loadAddressList() : Promise.resolve(null),
    domain ? loadDomainLists() : Promise.resolve(null),
  ]);

  if (address) {
    if (!addresses) result.degraded = true;
    else result.addressListed = addresses.has(address.toLowerCase());
  }

  if (domain) {
    if (!domains) result.degraded = true;
    else {
      result.domainListed = matchesDomain(domain, domains.blocked);
      result.domainAllowlisted = matchesDomain(domain, domains.allowed);
    }
  }

  return result;
}

/** Match the host itself or anything under it: "pay.scam.example" hits "scam.example". */
function matchesDomain(domain: string, list: Set<string>): boolean {
  const host = domain.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (list.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

async function loadAddressList(): Promise<Set<string> | null> {
  return loadCached(addressCache, async () => {
    const raw = await fetchJson(ADDRESS_FEED);
    if (!Array.isArray(raw)) return null;
    return new Set(raw.filter((a): a is string => typeof a === "string").map((a) => a.toLowerCase()));
  });
}

async function loadDomainLists(): Promise<DomainLists | null> {
  return loadCached(domainCache, async () => {
    const raw = await fetchJson(DOMAIN_FEED);
    if (!raw || typeof raw !== "object") return null;
    const config = raw as { blacklist?: unknown; whitelist?: unknown };
    if (!Array.isArray(config.blacklist)) return null;
    return {
      blocked: toDomainSet(config.blacklist),
      allowed: toDomainSet(Array.isArray(config.whitelist) ? config.whitelist : []),
    };
  });
}

function toDomainSet(list: unknown[]): Set<string> {
  return new Set(
    list.filter((d): d is string => typeof d === "string").map((d) => d.toLowerCase()),
  );
}

async function loadCached<T>(cache: Cache<T>, loader: () => Promise<T | null>): Promise<T | null> {
  if (cache.value && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.value;
  if (cache.inflight) return cache.inflight;

  cache.inflight = loader()
    .then((value) => {
      if (value) {
        cache.value = value;
        cache.fetchedAt = Date.now();
      }
      // Serve a stale list rather than nothing if the refresh failed.
      return value ?? cache.value;
    })
    .catch(() => cache.value)
    .finally(() => {
      cache.inflight = null;
    });

  return cache.inflight;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  return res.json();
}
