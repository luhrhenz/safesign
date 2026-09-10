# Screenshots

Every image here is a real capture of the deployed app at
<https://safesign-umber.vercel.app> answering a real address. Nothing is mocked
up, and the verdicts are whatever the rules actually returned on the day.

| File | Shows | Use it for |
|---|---|---|
| `hero.png` | All four states side by side, 1448×883 | Top of the grant application, README, pitch deck |
| `01-danger.png` | A listed drainer (`ClaimAirdrops`) → **Do not sign** | The strongest single image — lead with this one |
| `03-caution.png` | cUSD on Celo → **What this can do** | Shows the tool disclosing rather than crying wolf |
| `02-safe.png` | WETH → **No red flags**, four checks clear | Shows it is not just a red-flag machine |
| `04-link-paste.png` | A Dexscreener link resolved to USDC on Base | Shows link paste — the thing non-developers actually do |
| `05-unsupported.png` | A Stellar address refused, with a reason | Shows it declines rather than guessing |

Phone captures are 485×844 (390 CSS px), which suits the MiniPay listing form.

## Regenerating

Screenshots are captured from the live deployment at a 390×844 viewport, then:

```bash
python3 scripts/hero.py     # composes hero.png from the panels
```

`scripts/hero.py` and `scripts/icons.py` share a hand-written PNG encoder:
Pillow can draw in this environment but not save, because its save path
preloads a plugin that imports `subprocess`.
