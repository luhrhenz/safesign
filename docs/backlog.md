# Backlog

Things deliberately left out of V1, with the reason.

- **Stellar / Soroban support** — possible post-grant, reusing the Soroban Guard
  detection logic. Out of scope for V1: SafeSign is EVM-only for the Celo/MiniPay
  grant. Stellar addresses are currently rejected with a clear message, never
  analysed (see `normalizeInput` in [`lib/chains.ts`](../lib/chains.ts)).
- **USDT and other issuer-controlled stablecoins read as DANGER** — factually
  correct but a credibility problem for the exact users we serve. Options written
  up in [`verification-notes.md`](verification-notes.md).
- **Durable KV usage counters** — the analytics event line is a server log today;
  grant metrics want something that survives a restart.
- **512×512 icon and a real-device MiniPay test** — required for the Discover
  listing, see [`minipay-submission.md`](minipay-submission.md).
