import { NextRequest, NextResponse } from "next/server";
import { CHAINS, detectChain, normalizeInput } from "@/lib/chains";
import { runChecks } from "@/lib/checks";
import { fetchContract } from "@/lib/fetchContract";
import { checkScamLists } from "@/lib/scamLists";
import { buildVerdict, isAmbiguous, provenanceNotes } from "@/lib/verdict";
import { cacheKey, getCached, isCacheable, setCached } from "@/lib/cache";
import { rephrase, rephraseAvailable } from "@/lib/llm/callLLM";
import { recordCheck } from "@/lib/analytics";
import type { CheckContext, CheckResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.input === "string" ? body.input : "";
  const miniPay = body?.miniPay === true;

  const parsed = normalizeInput(raw);
  if (parsed.kind === "unknown") {
    return NextResponse.json(
      { error: "Paste a token address, a contract address, or a link." },
      { status: 400 },
    );
  }

  try {
    const response =
      parsed.kind === "link"
        ? await checkLink(parsed.domain!)
        : await checkAddress(parsed.address!, parsed.chainHint, parsed.domain);

    recordCheck({
      kind: response.subject.kind,
      chain: response.subject.chain,
      verdict: response.verdict,
      engine: response.engine,
      verified: response.subject.verified,
      findingCount: response.findings.length,
      cached: response.cached === true,
      miniPay,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error("check failed:", err);
    return NextResponse.json(
      { error: "Could not finish the check. Try again in a moment." },
      { status: 500 },
    );
  }
}

/** A link with no address in it: all we can check is the site itself. */
async function checkLink(domain: string): Promise<CheckResponse> {
  const key = cacheKey({ domain });
  const cached = await getCached(key);
  if (cached) return { ...cached, cached: true };

  const scam = await checkScamLists(undefined, domain);
  const input = { kind: "link" as const, verified: false, findings: [], scam };

  const response: CheckResponse = {
    ...(await withOptionalRephrase(input)),
    degraded: scam.degraded,
    subject: { kind: "link", domain },
    findings: [],
  };

  if (isCacheable(response)) await setCached(key, response);
  return response;
}

async function checkAddress(
  address: string,
  chainHint?: ReturnType<typeof normalizeInput>["chainHint"],
  domain?: string,
): Promise<CheckResponse> {
  const detection = await detectChain(address, chainHint);

  // Nothing found anywhere we look. Say that plainly instead of guessing.
  if (!detection.chain) {
    const scam = await checkScamLists(address, domain);
    return {
      verdict: scam.addressListed ? "DANGER" : "CAUTION",
      reasons: scam.addressListed
        ? ["This address is on a public list of addresses used to steal from wallets."]
        : [
            "This address has no code on Celo, Base, Ethereum or BNB Chain, so there was nothing to check.",
          ],
      whatToDo: scam.addressListed
        ? "Do not send anything to this address."
        : "Check you copied the whole address, and that it is on one of these networks.",
      engine: "rules",
      degraded: scam.degraded,
      subject: { kind: "address", address, domain },
      findings: [],
    };
  }

  const chain = detection.chain;

  // The cache is checked once the chain is known, since a verdict is per chain.
  const key = cacheKey({ chain, address });
  const cached = await getCached(key);
  if (cached) return { ...cached, cached: true };

  const [contract, scam] = await Promise.all([
    fetchContract(address, chain),
    checkScamLists(address, domain),
  ]);

  const ctx: CheckContext = {
    address,
    chain,
    verified: contract.verified,
    source: contract.source,
    sourceLookupInconclusive: contract.sourceLookupInconclusive,
    contractName: contract.contractName,
    abi: contract.abi,
    bytecode: contract.bytecode,
    owner: contract.owner,
    ownerIsContract: contract.ownerIsContract,
    proxy: contract.proxy,
  };

  const findings = runChecks(ctx);
  const input = { kind: "contract" as const, verified: contract.verified, findings, scam };

  const response: CheckResponse = {
    ...(await withOptionalRephrase(input)),
    degraded: scam.degraded || contract.sourceLookupInconclusive,
    notes: provenanceNotes(contract.provenance),
    subject: {
      kind: "address",
      address,
      domain,
      chain,
      chainLabel: CHAINS[chain].label,
      verified: contract.verified,
      contractName: contract.contractName || undefined,
      sourceProvider: contract.provenance?.provider,
      sourceConfidence: contract.provenance?.confidence,
      sourceMatchType: contract.provenance?.matchType,
      explorerUrl: `${CHAINS[chain].explorerUrl}/address/${address}`,
    },
    findings,
  };

  if (isCacheable(response)) await setCached(key, response);
  return response;
}

/**
 * The rules produce the verdict. The optional layer may only reword it, only
 * for the ambiguous middle, and only when a provider is configured — any
 * failure leaves the rules wording exactly as it was.
 */
async function withOptionalRephrase(input: Parameters<typeof buildVerdict>[0]) {
  const verdict = buildVerdict(input);

  if (!rephraseAvailable() || !isAmbiguous(input, verdict.verdict)) {
    return { ...verdict, engine: "rules" };
  }

  const reworded = await rephrase(verdict);
  return reworded
    ? { verdict: verdict.verdict, ...reworded, engine: "rules+llm" }
    : { ...verdict, engine: "rules" };
}
