# On-chain footprint and activity

Written for grant and listing forms that ask for "on-chain performance". The
honest answer needs a sentence of context, because the usual metrics assume a
protocol that deploys contracts, and SafeSign deliberately deploys none.

## The short answer, ready to paste

> SafeSign has no on-chain footprint by design. It deploys no contracts, sends
> no transactions, and never requests wallet access — it is a read-only safety
> tool, and that is a security property rather than a limitation. A tool whose
> entire message is "be careful what you approve" cannot itself ask to be
> approved.
>
> Its on-chain activity is **reads**: every check makes 4–6 JSON-RPC calls
> against the chain in question (`eth_getCode`, `eth_getStorageAt` for the
> EIP-1967 implementation slot, and `eth_call` for `owner()`, `implementation()`
> and `token0()`), plus up to four `eth_getCode` probes to detect which chain a
> bare address lives on.
>
> The meaningful measure is therefore **contracts analysed**, not transactions
> generated — and specifically contracts analysed on Celo, which is reported
> per-chain at `/api/stats`.

## Why there is nothing to deploy

| Usual metric | SafeSign | Why |
|---|---|---|
| Contracts deployed | none | Analysis is off-chain; deploying one would add attack surface and cost users gas for nothing |
| Transactions sent | none | The app never signs anything |
| TVL / volume | none | It never custodies or moves funds |
| Unique wallets connected | none | It never calls `eth_requestAccounts` |
| Gas consumed by users | none | Every check is free to the user |

A reviewer should read that table as a design decision, not a gap. The most
common way a "wallet security" tool harms people is by asking them to connect
and approve something in order to be protected. SafeSign cannot do that to
anyone, because it never asks.

## What we do measure, and where it comes from

`GET /api/stats` (bearer token, `STATS_TOKEN`) returns live counters backed by
Redis:

| Field | Meaning |
|---|---|
| `checks` | Total checks served |
| `chains` | **Checks per chain** — `celo`, `base`, `ethereum`, `bsc` |
| `verdicts` | Split across `SAFE` / `CAUTION` / `DANGER` |
| `distinctAddresses` | Unique contracts analysed (deduplicated) |
| `miniPayChecks` | Checks made from inside the MiniPay browser |
| `rejections` | Inputs the classifier refused rather than guessed at |
| `firstSeenAt` / `lastSeenAt` | Window the numbers cover |

`chains.celo` and `distinctAddresses` are the two figures a Celo programme
should be given: how much of the work landed on Celo, and how many distinct
contracts were examined.

## The impact metric, stated honestly

The number that matters most cannot be measured directly: **approvals not
signed**. SafeSign's value is a transaction that never happens, and there is no
way to observe a counterfactual.

What can be reported is its proxy — **`verdicts.DANGER`, the number of times a
user was told not to sign something.** Each one is a moment where a person was
shown a specific reason to stop. We do not claim each is a prevented theft, and
the application should not either.

## Detection quality, since "performance" may mean accuracy

Measured against a labelled corpus, reproducible with
`SAFESIGN_BENCH=1 npx vitest run tests/accuracy.live.test.ts`:

- **0% false-alarm rate** across 24 widely-held tokens on Celo, Base, Ethereum
  and BNB Chain — no major token is told "do not sign"
- Sampled drainers from a public list, with the scam list switched **off**, to
  measure whether the static analysis earns its place rather than riding on a
  blocklist

Full numbers and the raw table: [`accuracy.md`](accuracy.md). Known weaknesses
are written down in [`limitations.md`](limitations.md).
