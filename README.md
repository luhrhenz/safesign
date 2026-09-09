# SafeSign — Crypto Scam & Contract Safety Checker

> Working title. Rename freely (e.g. ChainGuard, SafeSign, Kite). Mobile-first tool that lets a non-technical user check **"is this token / contract / link safe before I sign?"** — built by an auditor, for emerging-market crypto users.

---

## 1. What this is (read this first, Claude)

A mobile-first web app where a user pastes a **token address, contract address, or dApp/transaction link** and gets back a **plain-language traffic-light verdict** — `SAFE` / `CAUTION` / `DANGER` — with 2–3 simple reasons and a "what to do" line.

The core insight driving every decision below:
- The **scams live on EVM chains** (Ethereum, Base, BSC, Celo) — so the analysis engine is **EVM-first**.
- The **users we protect live on Celo/MiniPay** (~14M mobile wallets, mostly Africa / LatAm / SE Asia, non-technical, most exposed to drainers). So the app is **homed as a Celo / MiniPay mini-app**.
- Celo is now an **Ethereum L2 (OP Stack, EVM)** — so "build on Celo" and "analyze all EVM chains" are the **same engine**. We lose nothing technically.

This is NOT a browser extension for crypto-natives (that space is taken by Wallet Guard, Scam Sniffer, Blockaid). The differentiation is: **mobile-first, dead-simple, inside MiniPay, plain language, built on real audit logic.**

## 2. Core design principle: the rules are the brain, AI is just the mouth

**Code does the detecting. AI does not.** This is the most important thing in this file.

- The **rule functions (plain TypeScript) find the problems** — honeypot traits, hidden mint, unrenounced ownership, unlimited approvals, blocklisted address. These are deterministic: same contract in, same verdict out, every time. Zero cost, no API key, can't hallucinate.
- The **verdict** (`SAFE / CAUTION / DANGER`) is a simple rule over the findings.
- Each finding already carries a hardcoded `humanReason` string, so the user-facing explanation needs **no AI at all**.
- **AI is optional and only rephrases** findings into friendlier language. It is a *nice-to-have*, added late (Phase 8), and the tool must work fully without it.

Why this matters for a safety tool: you never want an LLM *deciding* if something is safe — a hallucinated `SAFE` gets someone drained. The auditor's knowledge lives in explicit, checkable rules. That's the edge.

**This also means V1 costs $0 and has no rate limits.**

## 3. Goals

- **V1 goal:** a live, working, mobile-first checker that a real MiniPay user can open and use, with basic usage analytics. This is the minimum needed to apply for a grant.
- **Non-goal for V1:** any AI dependency, wallet transaction simulation, browser extension, multi-language, on-chain components. Keep it lean and free-to-run.

## 4. Grant strategy (why the build choices are what they are)

- **First target: Celo / Prezenti Anchor Pool.** Stage-based grants from ~$25K, tied to real traction. Pitch = "protect MiniPay's users from drainers." Include a **Karma GAP project profile** when applying (Celo asks for it).
- **Parallel target: Base Builder Grants.** Retroactive, up to ~$5K, fast, for shipped consumer apps. Same EVM engine already covers Base contracts — zero extra build.
- **Do NOT lead with Stellar/Soroban for this product** — the scam problem there is small. (Keep Soroban for security tooling like Soroban Guard.)

Grant-readiness checklist lives at the bottom of this file (Section 11).

---

## 5. Tech stack (chosen for zero running cost)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript** | Lawrence's stack; deploys free on Vercel; works as a MiniPay mini-app (web app). |
| Backend | **Next.js API routes (serverless)** | No separate server to pay for. |
| Contract data | **Sourcify** (primary, keyless) → Etherscan V2 (dormant until a key exists) → Blockscout for Celo, plus public RPC | Works with no API key at all: Sourcify covers cUSD, CELO, USDC on Base and the Ethereum majors. Etherscan V2 needs one key for all four chains and activates by itself once `ETHERSCAN_API_KEY` is set. |
| Detection | **Plain TypeScript rule functions** (Section 7) | The core product. No AI, no key, no cost. |
| Verdict | **Deterministic rules over findings** + hardcoded `humanReason` strings | Plain-language output with zero AI. |
| Cache | **Free KV** (Upstash Redis or Vercel KV free tier) | Cache verdicts by address+chain — kills most repeat work. |
| AI (OPTIONAL, Phase 8) | Free-tier LLM via a `callLLM()` fallback (Groq → Gemini → OpenRouter → local Ollama) | Only rephrases findings. Degrades gracefully when rate-limited. |
| Analytics | **Durable counters in KV** (`lib/analytics.ts`), read through a private `/api/stats` | A log line as well, but platform logs roll off and a number nobody can retrieve is not evidence of traction. No client-side tracker on a slow phone, no third-party script, no dependency. `@vercel/analytics` was tried and dropped: its peer range conflicts with vitest's Vite. |
| Abuse control | Fixed-window rate limit, in memory (`lib/rateLimit.ts`) | The endpoint is public and each call fans out into a source lookup and a dozen RPC calls. |

> MiniPay requirements were read from the official docs on 2026-09-08 and written
> up in [`docs/minipay-submission.md`](docs/minipay-submission.md). Short version:
> the provider is `window.ethereum` flagged `isMiniPay === true`, **there is no
> manifest file** (the listing form carries the metadata), and the listing review
> checks HTTPS, a 360×640 viewport, exact dependency pinning, `ignore-scripts`,
> and in-app Terms / Privacy / Support links.

## 6. Architecture — the analysis pipeline

```
User input (address OR link)
        │
        ▼
[1] Normalize & detect chain   → which EVM chain? which address?
        │
        ▼
[2] Cache check                → seen this address+chain before? return cached verdict, done.
        │
        ▼
[3] Fetch contract             → verified source via explorer API
                                 (fallback: bytecode if unverified)
        │
        ▼
[4] Scam-list cross-reference  → is this address on a known blocklist?
        │
        ▼
[5] Static red-flag checks     → rule-based pattern detection (Section 7)
        │
        ▼
[6] Verdict engine (RULES)     → findings → SAFE/CAUTION/DANGER
                                 + reasons from hardcoded humanReason strings
        │
        ▼
[7] (OPTIONAL) AI rephrase     → only if uncertain + quota available; else skip
        │
        ▼
[8] Cache the verdict, return
```

Key rules:
- **Unverified source = automatic CAUTION at minimum.** Never return SAFE on a contract you couldn't read.
- **AI is step 7 and skippable.** If it's rate-limited or absent, the tool still returns a full rules-based verdict.
- **Severity reflects certainty, not capability.** Static analysis proves what code *can* do and can never prove intent.

### The three tiers

| Tier | Reserved for | Example |
|---|---|---|
| **DANGER** | Facts only — on a public scam list, code that blocks everyone selling, or a contract calling itself a security update | A listed drainer |
| **What this can do** | Every owner capability: can mint, freeze, pause, upgrade. Stated plainly, never called a scam | USDT, cUSD |
| **No red flags** | Nothing found. Never worded as "safe" | WETH |

A capability alone can never reach DANGER. An early version told users not to
sign USDT — correctly detecting that Tether can freeze and mint, then wrongly
concluding "scam". A tool that cries wolf on the stablecoin in your wallet
teaches people to ignore the red screen.

### Measured, not asserted

| Measure | Result |
|---|---|
| Legitimate tokens told "do not sign" | **0%** (24 widely-held tokens) |
| Sampled drainer contracts flagged | **100%** (16 from a public list) |
| Flagged by a real rule, not just "code unpublished" | **63%** |

Regenerate: `SAFESIGN_BENCH=1 npx vitest run tests/accuracy.live.test.ts`.
Full table in [`docs/accuracy.md`](docs/accuracy.md); what it cannot do is in
[`docs/limitations.md`](docs/limitations.md).

## 7. Static red-flag checks (this is the auditor's edge — the differentiator)

These are the checks a non-security tool can't do well. Implement as individual, testable rule functions. Each returns `{ id, severity, humanReason }`.

**Token safety (honeypot / rug patterns):**
- Can buy but can't sell — transfer restrictions, blacklist mappings, dynamic/high sell tax
- Hidden or unlimited **mint** function
- Owner can **pause / blacklist** arbitrary addresses
- Modifiable fees / `setTax`-style function that can be raised to ~100%
- Ownership **not renounced**; privileged owner-only functions
- Upgradeable proxy with an **EOA owner** (rug potential)

**Interaction safety (drainer / approval-phishing patterns):**
- Interaction requests **unlimited approval** or `setApprovalForAll` to an unknown spender
- Suspicious `permit` / signature requests routing funds to an unrecognized address

**General contract safety (for "is it safe to interact"):**
- Known vulnerability classes (reentrancy, missing CEI) where relevant

## 8. Cost & rate-limit strategy (so free tiers never break the tool)

Ordered by impact:

1. **Rules-first, graceful degradation.** The verdict is complete from rules alone. If any optional AI call fails (429, no key, offline), catch it and return the rules verdict. A rate-limited AI must NEVER mean a broken checker.
2. **Cache by `address + chain`.** Scam inputs cluster hard — thousands paste the same viral scam token. Analyze once, cache the verdict (free KV), serve everyone after instantly with zero further work. This removes the large majority of repeat processing.
3. **Only call AI on the ambiguous middle.** Blocklisted → instant DANGER. Unverified → instant CAUTION. Clean + verified + no flags → SAFE. None of those need AI. Reserve any LLM call for genuinely uncertain cases only.
4. **Send findings, not the whole contract.** The rules already extracted what matters. If you do call an LLM, pass the short findings list — not raw source. Small prompts = far slower to hit token limits.
5. **Multi-provider fallback in one `callLLM()`.** Try Groq → on failure, Gemini free tier → OpenRouter free model → local Ollama. Different reset clocks multiply effective free quota.

Do #1 and #2 and rate limits basically stop mattering — you rarely reach an AI provider at all.

## 9. Suggested directory structure

```
safesign/
├── README.md
├── app/
│   ├── page.tsx                # mobile-first input + verdict UI
│   └── api/
│       └── check/route.ts      # main endpoint: input → verdict
├── lib/
│   ├── chains.ts               # chain detection + explorer/RPC config
│   ├── cache.ts                # KV get/set verdict by address+chain
│   ├── fetchContract.ts        # explorer API + bytecode fallback
│   ├── scamLists.ts            # blocklist cross-reference
│   ├── checks/                 # one file per static red-flag rule
│   │   ├── honeypot.ts
│   │   ├── mintable.ts
│   │   ├── ownership.ts
│   │   ├── approvals.ts
│   │   └── index.ts            # runs all checks, aggregates findings
│   ├── verdict.ts              # RULES → SAFE/CAUTION/DANGER + humanReason lines
│   └── llm/                    # OPTIONAL (Phase 8)
│       └── callLLM.ts          # Groq→Gemini→OpenRouter→Ollama fallback; rephrase only
├── components/
│   └── VerdictCard.tsx         # traffic-light result
└── .env.example                # explorer API keys (AI keys optional)
```

## 10. V1 build phases (do them in order)

**Status: Phases 0–6 are built, tested and green (55 unit tests, `npm test`).
Phase 7 needs your Vercel account; Phase 8 is wired but dormant.**

- ✅ **Phase 0 — Scaffold:** Next.js 16 + TS, `.env.example`. No CSS framework and **no runtime dependency beyond Next and React** — the stylesheet is ~1KB.
- ✅ **Phase 1 — Fetch:** `lib/chains.ts`, `lib/fetchContract.ts`, `lib/rpc.ts`. Chain is found by asking every chain at once whether it holds code (Celo wins ties). "Not published" and "we could not reach the explorer" are two different messages.
- ✅ **Phase 2 — Static checks:** 15 rules across `lib/checks/{honeypot,mintable,ownership,approvals}.ts`, comment-stripped before matching, each with tests.
- ✅ **Phase 3 — Scam lists:** ScamSniffer addresses (~2.5k) + MetaMask phishing domains (~97k), cached in memory, and a feed that cannot be reached is reported as degraded rather than clean.
- ✅ **Phase 4 — Verdict engine (RULES, no AI):** `lib/verdict.ts`. Pure function, no network, no key. This is the product.
- ✅ **Phase 5 — Cache:** `lib/cache.ts` — Upstash/Vercel KV over REST when configured, in-process map otherwise. Incomplete checks are never cached.
- ✅ **Phase 6 — UI:** one input, one traffic-light card, plain language. 193KB compressed on first load, of which 190KB is the Next/React floor; our own HTML+CSS is 3.4KB. Checks run in ~0.7s warm, ~2.9s cold.
- ⬜ **Phase 7 — MiniPay + ship:** requirements confirmed and met in code — see [`docs/minipay-submission.md`](docs/minipay-submission.md). Usage counting is in (`lib/analytics.ts`). Left to do: deploy, a 512×512 icon, and a real-device test.
- ⬜ **Phase 8 — (OPTIONAL) AI rephrase layer:** `lib/llm/callLLM.ts` is written (Groq → Gemini → OpenRouter → Ollama, findings only, never the source) and **dormant**: with no key set nothing is called, and it only runs for the ambiguous middle. It can never change a verdict — it returns wording or null.

## 11. Design constraints (do not skip — this is the whole point)

- **Low-end mobile first.** Small bundle, fast load on a $50 Android over a slow network. No heavy client libs.
- **Plain language.** No jargon in user-facing output. "This token may not let you sell it back" — not "transfer function reverts on non-whitelisted `msg.sender`."
- **Fail safe.** When unsure, say CAUTION. Never over-promise SAFE.
- **No hard AI dependency.** The tool is fully functional with no AI key set.

## 12. Grant-readiness checklist (before applying to Prezenti)

- [ ] Live public URL, working
- [ ] Works inside MiniPay on a real device
- [ ] Open-source GitHub repo, clean README (this file, updated)
- [ ] Some real usage numbers (even small — screenshots + analytics)
- [ ] Karma GAP project profile created
- [ ] 60–90 second demo (screen recording on a phone)
- [ ] One-paragraph pitch: "protect MiniPay's 14M+ users from drainers / scam tokens"

---

## Notes for Claude Code

- **Detection is code, not AI.** All finding/verdict logic is deterministic TypeScript. Do not route detection through an LLM.
- **V1 ships with no AI.** Build Phases 0–7 with zero AI calls. Phase 8 (AI rephrasing) is optional and must degrade gracefully — catch failures, fall back to hardcoded `humanReason` strings.
- **Cache aggressively** by address+chain; it's the single biggest cost saver for this product.
- Keep code **simple and readable** over production-clever — this is being built to learn from and ship fast.
- Confirm live facts (MiniPay mini-app spec, current explorer API endpoints/keys) from official docs before wiring them; don't hardcode assumptions.
- EVM-first. One engine. Celo + Base + Ethereum in V1; BSC next.