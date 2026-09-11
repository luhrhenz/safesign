# X — engagement posts

Launch copy lives in `x-post.md`. This is for afterwards: posts meant to get
replies, and the reply strategy that matters more than any of them while the
account is new.

Everything here uses real output from the live app. Never post a verdict you
have not actually run — the whole pitch is that this one tells the truth.

---

## The one that works at zero followers

Posting into an empty timeline does nothing. Replying does. Search X for people
who just got drained — "wallet drained", "lost my", "is this token legit",
"approved a contract" — and run their address for them.

```
Ran it: DANGER. It's on a public list of addresses that have already
taken funds from people.

[screenshot of the verdict]

Anyone can check before approving, free, no wallet connection:
safesign-umber.vercel.app
```

Rules that keep this from reading as spam:

- **Run it first.** Post the real screenshot, not a pitch.
- **Answer even when the answer is boring.** "No red flags — you're fine" earns
  more trust than only showing up for the dramatic ones.
- **Don't reply to people who are already being scammed by a reply guy.** They
  are being farmed; adding a link makes you look like part of it.

## Offer to check things — the highest-yield post

```
Reply with any token — the name, the address, or the link someone sent
you — and I'll tell you what's actually in the contract.

Free, no wallet connection, no catch. I built the thing, I may as well
run it for you.
```

Do this weekly. Every reply is a public demonstration, and the thread becomes a
body of evidence a grant reviewer can read.

---

## Posts that can travel

### 1. The USDT provocation

Crypto-native audience, and it is a genuinely contrarian technical take.

```
Most "token safety" scanners will tell you USDT is dangerous.

Its owner can freeze your wallet. Mint unlimited supply. Pause every
transfer. All true. All in the code.

And it's the most-used token in crypto.

The bug isn't the detection — it's that a scanner can't tell what code
CAN do from what's actually proven. So it screams at everything, and
you learn to ignore it.

I fixed that in mine: DANGER is reserved for facts.
```

### 2. The name collision

This teaches the core insight and is quietly alarming.

```
Search "BEAN" and you get two completely different tokens.

Different contracts. Same name. Both real.

This is why "just check the name" doesn't work, and why every tool that
resolves a name to ONE token is quietly dangerous.

Mine shows you all of them and makes you pick. [screenshot]
```

### 3. The receipts post

Nobody publishes this number. That is exactly why it travels.

```
I measured my own false-alarm rate.

24 tokens that millions of people hold — USDT, USDC, DAI, WETH, cUSD,
CELO, CAKE — run through my scanner.

Tokens wrongly flagged as DANGER: 0.

The script that produced this is in the repo. Run it yourself.
```

### 4. The drainer autopsy

```
Found six scam contracts today with their source code published.

All six named "SecurityUpdates".

That's the whole trick — it's named so that "do you approve this?"
feels like routine phone maintenance. No real project has ever shipped
a contract called that.

So I treat that name as proof, not a hint.
```

### 5. Poll

Polls are cheap engagement, and this one sets up a real point.

```
The stablecoin in your wallet right now — can its owner freeze your
balance?

□ Yes
□ No
□ Never thought about it

(The answer for most of them is yes. That isn't a scam — it's just
something you should know before you're surprised by it.)
```

### 6. The one-line public service

Short, repostable, no link — links suppress reach, and this one earns the
follow instead.

```
If a page asks you to approve a "security update" for your wallet,
that's not maintenance. That's the attack.

Real projects never ask you to run one.
```

---

## A recurring format worth sustaining

**"Checked today"** — one post, a few times a week, showing one real thing you
ran. A scam you caught, a token that came back clean, a name collision you hit.

It compounds: it is a product demo, a credibility record, and a body of
evidence for the grant application, all from one habit.

---

## Notes

- Screenshots beat text. The verdict card is legible at thumbnail size — that
  was a design goal, so use it.
- Links reduce reach on X. Put the link in a reply to your own post when the
  post itself is the point.
- Never claim a check prevented a theft. You cannot observe a counterfactual,
  and the honesty is the brand.
