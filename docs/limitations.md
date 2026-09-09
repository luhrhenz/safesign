# What SafeSign cannot do

Written down deliberately. A security tool that oversells itself is worse than
no tool, because people act on it.

## The rules can be evaded by anyone who reads them

Detection is regex over Solidity source plus 4-byte selectors in bytecode, and
the repository is public. A scammer who renames `_blacklist` to `_userState`,
or `SecurityUpdate()` to `Step1()`, walks past those specific rules.

Two things make it still worth running:

- Most scams are copy-paste. The six `SecurityUpdates` contracts found in the
  benchmark were the *same contract*, deployed repeatedly. Raising the cost of
  the laziest 80% is worth doing even if the top 20% get through.
- The scam-list layer does not care what the code says. An address that has
  already robbed someone is flagged regardless of how it is written.

What this means for a user: **a clean result is not a promise.** The wording
never says "safe" for exactly this reason.

## It only sees what is on chain

- No transaction simulation. SafeSign cannot tell you what a specific signature
  will do to your wallet — only what the contract behind it is capable of.
- No off-chain context: no team, no audit history, no liquidity, no lock-up.
  A perfectly clean contract with a rug-pulling team looks clean here.
- A link is checked as a name against a phishing list. The page behind it is
  never loaded, so a brand-new phishing domain is unknown to us.

## The measured limits

From [accuracy.md](accuracy.md), which is regenerated from live data:

- **0% false alarms** on 24 widely-held tokens — none is told "do not sign".
- **100% of sampled drainer contracts flagged**, and **63% carried by a real
  rule** rather than by "the code was never published".
- That leaves roughly a third resting on the weak signal. An unverified contract
  that is perfectly honest gets the same CAUTION as an unverified drainer.
- The corpus is 24 tokens and 16 drainers. That is a floor on quality, not a
  claim about the long tail.

## Verdicts are mostly CAUTION, on purpose

83% of widely-held tokens land in "What this can do". That is not the tool
hedging: those tokens genuinely can freeze, mint or be upgraded, and saying so
plainly is more useful than a green tick. But it does mean **CAUTION is a
disclosure, not a warning**, and the interface has to keep making that
difference obvious.

## Coverage gaps

- EVM only: Celo, Base, Ethereum, BNB Chain. Everything else is refused by name.
- Without `ETHERSCAN_API_KEY`, a contract verified on Etherscan but absent from
  Sourcify reads as unverified. That is a coverage gap, not a signal.
- A Dexscreener link to a trading pair is refused rather than guessed at.
