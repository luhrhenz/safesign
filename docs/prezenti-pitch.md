# SafeSign — Prezenti / Celo Anchor Pool

## The pitch, in one paragraph

MiniPay has activated 18M+ wallets across 60+ countries, with strong adoption in Nigeria,
Kenya, Ghana and South Africa, and most belonging to people for whom a drained
wallet is a month's income rather than an inconvenience. SafeSign is a
mobile-first checker for those users: paste a token address, a contract, or a
link from wherever you saw the coin, and get back a plain-language answer about
what it can do to your money — no jargon, no wallet connection, nothing to
install. The verdict is deterministic TypeScript, not an AI guess: 15 static
rules over published source, 4-byte selector analysis for contracts that hide
their code, and public scam-list cross-referencing across Celo, Base, Ethereum
and BNB Chain through a single keyless provider. It is built by a smart-contract
auditor, it is read-only by design, and its accuracy is measured and published
rather than asserted.

## Why it is credible

**The verdict is deterministic.** Same input, same answer, and the reasoning is
readable in the repository. The optional AI layer may only reword a finished
verdict — it cannot change one, and the tool works fully with it switched off.

**Accuracy is measured, and the numbers are in the repo.** Against 24 widely
held tokens and 16 drainer contracts sampled from a public list:

| Measure | Result |
|---|---|
| Legitimate tokens told "do not sign" | **0%** |
| Sampled drainer contracts flagged | **100%** |
| Flagged by a real rule, not just "code unpublished" | **63%** |

Regenerate it with `SAFESIGN_BENCH=1 npx vitest run tests/accuracy.live.test.ts`.

**We fixed the failure that matters most.** An early version told users not to
sign USDT — correctly detecting that Tether can freeze and mint, then wrongly
concluding "scam". A tool that cries wolf on the stablecoin in your wallet
teaches you to ignore the red screen. The model now separates what code *can do*
from what is *proven harmful*, and only proof condemns.

**Read-only by design.** SafeSign never requests wallet access. A security tool
asking for `eth_requestAccounts` is asking users to practise the exact habit
that gets them drained.

**It runs on nothing.** Two runtime dependencies. Free tiers throughout. No key
required for source verification — Sourcify covers cUSD, CELO, USDC on Base and
the Ethereum majors.

## How it reaches people who would never paste an address

The honest problem with any "check before you sign" tool is that the person
about to be drained is not in a checking frame of mind. Our answer is not to
hope they become one:

1. **It travels the way the scam travels.** Scams arrive in WhatsApp and Telegram
   groups. A DANGER result has one button — *Warn someone* — that puts a plain
   warning back into the same group, with a link that lets the next person check
   for themselves.
2. **It settles arguments.** The realistic first user is not the victim but the
   group admin or the one friend who is "good with phone things", checking on
   everyone else's behalf. That person needs an answer they can forward, which
   is what the share text is written to be.
3. **It accepts what people actually copy.** Nobody outside a dev team copies a
   contract address. Dexscreener, Dextools and explorer links all resolve.

## Milestones

| Stage | Deliverable | Evidence |
|---|---|---|
| 1 | Live mini-app inside MiniPay | Public URL, device screenshots |
| 2 | 500 checks from real users | `/api/stats` totals, verdict split |
| 3 | Detection quality: 80% of drainers caught by a rule, false alarms still 0% | Regenerated `accuracy.md` |
| 4 | Community distribution — group admins in 3 markets | Share events, referrer data |

## Ask

Stage-based, from the Anchor Pool's entry tier. The money buys three things:
paid RPC and explorer access so checks stay fast under load, an expanded and
maintained labelled corpus to keep accuracy honest as scams evolve, and the time
to work with MiniPay community groups in Nigeria and Kenya on distribution.

## Links

- Repository: https://github.com/luhrhenz/safesign
- Accuracy: [accuracy.md](accuracy.md)
- Limitations, stated by us: [limitations.md](limitations.md)
- Live URL: https://safesign-umber.vercel.app
- Karma GAP profile: _to add_

## Figures and sources

| Claim | Figure | Source |
|---|---|---|
| MiniPay activated wallets | 18M+ | minipay.to homepage, read 2026-09-10 |
| Transactions on Celo via MiniPay | 541M+ | minipay.to homepage, read 2026-09-10 |
| Countries | 60+ | minipay.to homepage, read 2026-09-10 |
| SafeSign false-alarm rate | 0% of 24 major tokens | docs/accuracy.md, reproducible via SAFESIGN_BENCH=1 |
| Drainers flagged, scam list off | see docs/accuracy.md | same run |

MiniPay describes itself as a **self-custodial** stablecoin wallet and positions
globally, not regionally. This pitch does not claim a demographic split it
cannot source: the argument rests on self-custody, which is verifiable and is
the reason a signature there is final.
