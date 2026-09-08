# MiniPay listing — requirements and where SafeSign stands

Sources, read 2026-09-08:

- <https://docs.minipay.xyz/getting-started/submit-your-miniapp.html>
- <https://docs.minipay.xyz/technical-references/>
- <https://docs.minipay.xyz/getting-started/overview.html>

Submission form: <https://developer.minipay.to/mini-app-listing>

## What MiniPay actually is (confirmed, not assumed)

- Mini Apps are **plain web apps** loaded in MiniPay's in-app browser. No native
  binary, and **no manifest file** — the listing form carries the metadata.
- MiniPay injects an **EIP-1193 provider at `window.ethereum`**, flagged
  `window.ethereum.isMiniPay === true`. Connection is implicit.
- Supported chains: **Celo Mainnet (42220)** and **Celo Sepolia (11142220)**.
- Testing on a device: expose the dev server (ngrok), enable Developer Mode in
  MiniPay, then "Load test page" and enter the URL.

## Technical requirements

| Requirement | Status |
|---|---|
| Served over HTTPS | Pending deploy (Vercel gives HTTPS by default) |
| Responsive down to a 360×640 viewport | Done — fluid layout, single column, no fixed widths |
| Auto-connects, no manual connection button | Done by construction — see note below |
| Graceful error handling for wallet operations | N/A — the app performs no wallet operations |
| PageSpeed Insights score | Pending deploy (needs a public URL) |
| Full manifest of URLs, subdomains and origins used | Below |

### Note on the auto-connect rule

The rule exists so users are not made to press "Connect wallet". SafeSign never
asks for a wallet at all: it reads public chain data, so it requests no accounts,
no signatures and no transactions. There is no connection button anywhere in the
app. `lib/minipay.ts` detects MiniPay only to count how many checks come from
inside the wallet.

If the reviewer reads the rule as "must call `eth_requestAccounts` on load",
that is a one-line change in `lib/minipay.ts` — but shipping it would mean asking
for the user's address for no functional reason, so it is deliberately not there.

### Origins the app talks to

Everything below is called **from the server**. The browser makes requests to the
app's own origin only — no third-party script, font, tracker or CDN is loaded
into the page.

| Origin | Why |
|---|---|
| `api.etherscan.io` | Verified contract source (V2 multichain: Celo, Base, Ethereum, BSC) |
| `forno.celo.org`, `celo-rpc.publicnode.com` | Celo RPC |
| `mainnet.base.org`, `base-rpc.publicnode.com` | Base RPC |
| `ethereum-rpc.publicnode.com`, `cloudflare-eth.com` | Ethereum RPC |
| `bsc-dataseed.binance.org`, `bsc-rpc.publicnode.com` | BNB Chain RPC |
| `raw.githubusercontent.com` | ScamSniffer address list, MetaMask phishing list |

Optional, only when configured (all unset by default — the app is fully
functional without them):

| Origin | Why |
|---|---|
| Upstash / Vercel KV REST host | Verdict cache |
| `api.groq.com`, `generativelanguage.googleapis.com`, `openrouter.ai` | Optional rephrasing of the rules' wording |

## Dependency security requirements

| Requirement | Status |
|---|---|
| Exact npm version pinning, no `^` or `~` | Done — `package.json` pins every version, `.npmrc` sets `save-exact=true` |
| `ignore-scripts=true` in `.npmrc` | Done |
| Committed lockfile, reproducible install | Done — `package-lock.json` is committed |
| Dependencies at least 7 days old | Check at submission time; current set is well past it |

## Content and legal requirements

| Requirement | Status |
|---|---|
| Terms of Service reachable in-app | Done — `/terms`, linked in the footer |
| Privacy Policy reachable in-app | Done — `/privacy`, linked in the footer |
| Dedicated in-app support link | Done — footer link, set in `lib/config.ts` (update to the real repo URL) |
| Clear ownership and branding | Pending — publisher name goes on the form |
| Icon, 512×512 | **Outstanding** — needs to be designed |
| Critical issues fixed within 24 hours | Operational commitment |

## Smart contract requirements

Not applicable: SafeSign deploys no contracts.

## Form fields to have ready

App name, tagline (1–2 sentences), publisher, support URL, Terms URL, Privacy
URL, category (utility), app URL, 512×512 icon.
