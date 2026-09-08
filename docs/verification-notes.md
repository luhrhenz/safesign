# Verification notes — source providers

Last run: 2026-09-08, with **no `ETHERSCAN_API_KEY` set** (their site was under
maintenance). Everything below was observed against the live APIs, not assumed.

## Provider order

```
1. sourcify    primary, keyless, all chains
2. etherscan   dormant — skipped silently unless ETHERSCAN_API_KEY exists
3. blockscout  keyless, Celo (42220) only
```

Defined once in `PROVIDER_ORDER` in [`lib/fetchSource.ts`](../lib/fetchSource.ts).
Moving `"etherscan"` to the front is the one-line change that makes it preferred
once the key exists; nothing else needs touching.

## ⚠️ Read this before chasing a false negative

**While `ETHERSCAN_API_KEY` is absent, a "CAUTION: could not verify source"
result may be a Sourcify COVERAGE GAP, not a real signal.** A contract that is
verified on Etherscan but has never been submitted to Sourcify will read as
unverified until the key is added.

Do not treat these as false negatives to chase. They resolve by themselves when
the Etherscan tier is enabled. Before investigating any "unverified" result,
check whether the contract is simply absent from Sourcify.

The distinction the code already makes:

| Finding | Means |
|---|---|
| `meta.unverified_source` | A provider answered cleanly: nobody has published this source. Could still be a coverage gap. |
| `meta.source_unavailable` | No provider gave a clean answer — all errored or were skipped. A fact about us, not the contract. |

## Confirmed API shapes

**Sourcify v2** — `GET https://sourcify.dev/server/v2/contract/{chainId}/{address}?fields=all`
(schema from `https://sourcify.dev/server/api-docs/swagger.json`):

- `match`, `creationMatch`, `runtimeMatch` ∈ `"exact_match" | "match" | null`
- `sources` is `{ path: { content } }`; `compilation.name`, `compilation.compilerVersion`; `abi`
- 404 when the contract is not verified

Mapping: `exact_match` → confidence **high**; `match` (partial) → **medium**.

**Blockscout Celo** — `GET https://celo.blockscout.com/api/v2/smart-contracts/{address}`:

- `source_code` plus `additional_sources[{file_path, source_code}]`
- `is_verified`, `is_fully_verified`, `is_partially_verified`, `name`, `compiler_version`
- 404 `{"message":"Not found"}` when unknown

Mapping: fully verified → **high**; partially verified → **medium**.

## Sourcify coverage spot-check (2026-09-08)

| Contract | Chain | Sourcify | Confidence |
|---|---|---|---|
| cUSD | Celo 42220 | `exact_match` | high |
| USDC | Base 8453 | `exact_match` | high |
| USDT | Ethereum 1 | `match` (partial) | medium |
| USDC | Ethereum 1 | `match` (partial) | medium |
| WETH | Ethereum 1 | `match` (partial) | medium |

Coverage on the majors is better than expected — the no-key path is genuinely
usable today, not a degraded stopgap. Note the pattern: Celo and Base majors are
exact matches, Ethereum majors are partial. Partial matches are annotated in the
verdict notes and change no severity.

## The proxy/owner read is independent — and it matters

The EIP-1967 slot and `owner()` reads go straight to a public RPC node
(`forno.celo.org` for Celo), never through the source provider. This is not
belt-and-braces; it catches a real gap:

> For cUSD, **Sourcify's own `proxyResolution` reports `isProxy: false`**, while
> the EIP-1967 slot is populated (`0x815795c3…c974c318`) and Blockscout agrees it
> is `eip1967`. Our RPC read is what produces the upgradeable-proxy warning.

Confirmed live with source coming from Sourcify:

```
celo:0x765DE816845861e75A25fCA122bb6898B8B1282a
  CAUTION | provider: sourcify | confidence: high | match: exact_match | verified: true
  - This contract can be upgraded, so the code behind it can change later.
  notes: Source code read from Sourcify.
  findings: ownership.upgradeable, ownership.owner_is_contract
```

## No-key behaviour, verified end to end

- The Etherscan tier is skipped with outcome `"skipped"`; it makes no request,
  raises nothing, and writes nothing to the log. Grepping the server log for
  `api.?key|etherscan` after a run returns nothing.
- Attempt records are asserted to contain no key-shaped string
  (`tests/fetchSource.test.ts`).
- When no provider has source, the result is `CAUTION` with a "could not verify"
  reason — never a hard failure.

## Open question for review: USDT reads as DANGER

Running USDT (Ethereum) through the full pipeline now that real source is
available:

```
DANGER — blacklist mapping, transfer restrictions, unlimited mint, pausable
```

Every one of those findings is **factually correct** — Tether can freeze wallets
and mint without a cap — but telling a user "do not sign" for USDT is a
credibility problem, and USDT is exactly what a MiniPay user holds.

This is a product decision, not a bug, so nothing was changed: the severity rules
were explicitly out of scope for this pass. Options worth considering:

1. An allowlist of major issuer-controlled stablecoins that annotates rather than
   condemns ("the issuer can freeze this — that is normal for USDT").
2. Split "issuer control" from "anonymous-owner control" as separate rule
   families, since the risk to a user is genuinely different.
3. Leave as is and accept it.

## Test coverage

`tests/fetchSource.test.ts` — 21 tests, fixtures captured from the live
responses in `tests/fixtures/`:

- Sourcify exact → high; partial → medium; null match → no source
- Sourcify answering stops the chain (Etherscan/Blockscout never called)
- Etherscan skipped silently with no key; attempted and preferred once a key exists
- Blockscout answers on Celo, skipped on other chains, partial → medium
- Nobody has it → clean not-found → CAUTION "could not verify"
- Everything down → inconclusive → `meta.source_unavailable`
- cUSD through the Sourcify path → still CAUTION on the off-chain proxy read

One opt-in live check: `SAFESIGN_LIVE=1 npm test` (passes, ~2.2s).

---

# Verification notes — optional rephrase layer (Phase 8)

Live-checked 2026-09-08 with real Groq and Google AI Studio keys.

## Model defaults had to change — the old ones are dead

| Provider | Was | Now | Why |
|---|---|---|---|
| Groq | `llama-3.3-70b-versatile` | `qwen/qwen3.8-27b` | The Llama 3.3 line is **retired** — the key returns `model_not_found`. This key's catalogue is `openai/gpt-oss-120b`/`20b`, `qwen/qwen3.6-27b`, `qwen/qwen3.8-27b`, `groq/compound`, plus whisper/guard models. |
| Gemini | `gemini-2.0-flash` | `gemini-flash-lite-latest` | `gemini-2.0-flash` no longer exists. `gemini-2.5-flash` is listed but 404s for new keys ("no longer available to new users"). |

## Measured, on the real rephrase prompt

| Model | Latency | JSON valid | Softened a DANGER? |
|---|---|---|---|
| `qwen/qwen3.8-27b` | 0.6–1.7s | 3/3 runs | no |
| `openai/gpt-oss-120b` | 1.5–1.8s | 3/3 runs | no |
| `openai/gpt-oss-20b` | 1.5s | yes | no |
| `gemini-flash-lite-latest` | 1.1s | yes | no |
| `gemini-flash-latest` | 6.1s | **truncated** | — |
| `gemini-3.6-flash` | 27.1s | **truncated** | — |

The Gemini 3.x flash models spend output tokens on hidden reasoning and run out
mid-JSON at a small cap. `maxOutputTokens` was raised to 1500 for Gemini and 800
for the OpenAI-compatible providers, and the lite alias is the default.

## Gating, confirmed end to end

| Case | Engine | Correct because |
|---|---|---|
| USDT — verified, 4 findings | `rules+llm` | the ambiguous middle is exactly what the layer is for |
| cUSD — verified, 1 finding | `rules` | one finding is not ambiguous; no call made |
| Listed drainer address | `rules` | a scam-list hit is never sent to a model |
| Both keys invalid | `rules` | 2 warnings in the server log, nothing user-facing, verdict unchanged |

Verdicts were identical with and without the layer. It reworded, and that is all
it did — as designed, it can only return wording or null.

## Key handling

The Groq key initially landed in `.env.example`, the one env file whitelisted for
commit. It was moved to `.env.local` (ignored by `.gitignore:5 .env*`) and the
template scrubbed back to empty. Nothing was ever committed — the repo had no
commits at that point — so no key entered git history.
