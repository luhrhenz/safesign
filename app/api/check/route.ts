import { NextRequest, NextResponse } from "next/server";
import { CHAINS, detectChain, linkGuidance, normalizeInput, unrecognizedMessage } from "@/lib/chains";
import { settleTarget } from "@/lib/resolveLink";
import { runChecks, summariseChecks } from "@/lib/checks";
import { fetchContract } from "@/lib/fetchContract";
import { checkScamLists } from "@/lib/scamLists";
import { buildVerdict, isAmbiguous, provenanceNotes } from "@/lib/verdict";
import { cacheKey, getCached, isCacheable, setCached } from "@/lib/cache";
import { rephrase, rephraseAvailable } from "@/lib/llm/callLLM";
import { recordCheck, recordRejection } from "@/lib/analytics";
import { isWellKnown } from "@/lib/wellKnown";
import type { CheckContext, CheckResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.input === "string" ? body.input : "";
  const miniPay = body?.miniPay === true;

  const parsed = normalizeInput(raw);

  // Nothing we can identify goes no further: no chain probe, no scam-list
  // lookup, no verdict. Just an honest "not this, and here is what we do check".
  if (parsed.kind === "unrecognized") {
    const reason = parsed.reason ?? "generic";
    recordRejection(reason);
    return NextResponse.json({
      status: "unrecognized" as const,
      message: unrecognizedMessage(reason),
    });
  }

  try {
    // A link to a token site: settle what it points at, then either run the
    // ordinary check on the address it named, or explain why we cannot.
    if (parsed.kind === "link_target") {
      const target = await settleTarget(parsed.target!);

      if (target.kind === "address") {
        const resolved = await checkAddress(target.address, target.chain, parsed.domain);
        recordCheck({
          kind: resolved.subject.kind,
          chain: resolved.subject.chain,
          verdict: resolved.verdict,
          engine: resolved.engine,
          verified: resolved.subject.verified,
          findingCount: resolved.findings.length,
          cached: resolved.cached === true,
          miniPay,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(resolved);
      }

      const guidance = linkGuidance(target);
      recordRejection(target.kind === "unsupported_chain" ? "unsupported_chain" : "unresolved_link");
      return NextResponse.json({ status: "unrecognized" as const, ...guidance });
    }

    const response =
      parsed.kind === "url"
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
  if (cached) return { ...cached, status: "verdict", cached: true };

  const scam = await checkScamLists(undefined, domain);
  const input = { kind: "link" as const, verified: false, findings: [], scam };

  const response: CheckResponse = {
    status: "verdict",
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
      status: "verdict",
      verdict: scam.addressListed ? "DANGER" : "CAUTION",
      headline: scam.addressListed ? "Do not sign" : "Be careful",
      lede: scam.addressListed
        ? "This address is on a public list of addresses used to steal from wallets."
        : "There is no code at this address on any chain we check.",
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
  if (cached) return { ...cached, status: "verdict", cached: true };

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
    status: "verdict",
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
      wellKnown: isWellKnown(chain, address) || undefined,
      sourceProvider: contract.provenance?.provider,
      sourceConfidence: contract.provenance?.confidence,
      sourceMatchType: contract.provenance?.matchType,
      explorerUrl: `${CHAINS[chain].explorerUrl}/address/${address}`,
    },
    findings,
    checks: summariseChecks(ctx, findings),
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
  // The rephrase layer may only touch wording of the reasons and the action.
  // The verdict, headline and lede are the tier itself and stay untouched.
  return reworded
    ? { ...verdict, ...reworded, engine: "rules+llm" }
    : { ...verdict, engine: "rules" };
}
