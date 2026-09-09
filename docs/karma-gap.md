# Karma GAP profile

Fields for the Karma GAP project profile Celo asks applicants to create.
Anything not yet true is marked **[PLACEHOLDER]** rather than guessed.

## Project

**Name:** SafeSign

**Tagline:** Is this safe to sign? A scam checker for MiniPay users.

**Category:** Security / Consumer tooling

**Description:**
> SafeSign lets a non-technical crypto user check a token, contract or link
> before they approve it. Paste what you have — an address, or the link from
> wherever you saw the coin — and get a plain-language answer about what it can
> do to your money. Built for MiniPay users in emerging markets, where a drained
> wallet is a month's income. The verdict is deterministic static analysis, not
> an AI guess, and the tool never asks for wallet access.

**Problem:** Wallet drainers and scam tokens cost ordinary users more than any
other attack in crypto. Existing defences are browser extensions aimed at
crypto-natives on desktop; the most exposed users are on a cheap Android phone,
inside a wallet's in-app browser, reading in a second language.

**Solution:** A mobile-first checker with one input and a plain answer, homed as
a Celo/MiniPay mini-app and covering Celo, Base, Ethereum and BNB Chain from one
engine.

## Links

| Field | Value |
|---|---|
| Repository | https://github.com/luhrhenz/safesign |
| Live app | https://safesign-umber.vercel.app |
| Demo video | **[PLACEHOLDER — 60–90s, see demo-script.md]** |
| Twitter/X | **[PLACEHOLDER]** |
| Contact | **[PLACEHOLDER — email used on the application]** |

## Team

| Field | Value |
|---|---|
| Lead | Lawrence (**[PLACEHOLDER — full name as on the application]**) |
| Role | Smart-contract security auditor; sole developer |
| GitHub | https://github.com/luhrhenz |
| Prior work | Security audit and tooling work — **[PLACEHOLDER: link 1–2 public audits or reports]** |

## Grant

| Field | Value |
|---|---|
| Program | Prezenti / Celo Anchor Pool |
| Amount requested | **[PLACEHOLDER — entry tier, confirm current figure on the programme page]** |
| Funding stage | First grant for this project; no prior funding |
| Prior grants | None |

## Milestones

Mapped to the build phases, with the evidence each one produces.

**Milestone 1 — Live and reachable**
Deployed mini-app, working inside MiniPay on a real device.
*Evidence:* public URL, screenshots from an Android handset, MiniPay listing
submission.
*Status:* **deployed and public at https://safesign-umber.vercel.app**. Remaining: the real-device MiniPay test.

**Milestone 2 — Used by real people**
500 checks from real users, with the verdict split published.
*Evidence:* `/api/stats` totals, screenshots.
*Status:* counters built and live-ready; awaiting deployment.

**Milestone 3 — Detection quality held honest**
80% of sampled drainers caught by a real rule (currently 63%), false alarms
still 0% (currently 0%), on an expanded corpus.
*Evidence:* regenerated `docs/accuracy.md`, reproducible by anyone.
*Status:* benchmark built and published; corpus needs expanding.

**Milestone 4 — Distribution through communities**
Working with MiniPay community groups in Nigeria and Kenya so warnings travel
the way scams do.
*Evidence:* share events, group partnerships.
*Status:* share flow built; partnerships not started.

## What already exists

- Deterministic verdict engine, 171 tests, typecheck and production build green
- Published accuracy measurement anyone can regenerate
- Source verification with no API key (Sourcify), with Etherscan and Blockscout
  as fallbacks
- Read-only by design: no wallet connection, ever
- Two runtime dependencies; runs on free tiers
