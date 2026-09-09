/**
 * The USDT regression, and the model behind it.
 *
 * SafeSign used to return "Do not sign" for Tether — correctly detecting that
 * its owner can freeze wallets, pause transfers and mint without limit, and
 * then wrongly concluding it was a scam. The detections were right; the model
 * was wrong. Static analysis proves what code CAN do and can never prove why.
 *
 * These tests pin the fix: capabilities disclose, only facts condemn.
 */

import { describe, expect, it } from "vitest";
import { honeypotChecks } from "../lib/checks/honeypot";
import { mintableChecks } from "../lib/checks/mintable";
import { runChecks } from "../lib/checks";
import { buildVerdict } from "../lib/verdict";
import { isWellKnown } from "../lib/wellKnown";
import { context, ids } from "./helpers";
import type { Finding } from "../lib/types";

const CLEAN_SCAN = {
  addressListed: false,
  domainListed: false,
  domainAllowlisted: false,
  degraded: false,
};

const verdictFor = (findings: Finding[], overrides = {}) =>
  buildVerdict({ kind: "contract", verified: true, findings, scam: CLEAN_SCAN, ...overrides });

/**
 * The real thing: USDT's owner powers, as our rules actually detect them.
 * Trimmed from the deployed TetherToken source.
 */
const USDT_SOURCE = `
  contract TetherToken is Pausable, StandardToken, BlackList {
    mapping (address => bool) public isBlackListed;
    function addBlackList(address _evilUser) public onlyOwner {
      isBlackListed[_evilUser] = true;
    }
    function issue(uint amount) public onlyOwner {
      balances[owner] = balances[owner].add(amount);
    }
    function mint(address to, uint amount) public onlyOwner {}
    function pause() onlyOwner whenNotPaused public { paused = true; }
    function transfer(address _to, uint _value) public whenNotPaused {
      require(!isBlackListed[msg.sender]);
    }
  }
`;

describe("Ethereum USDT — the bug this model exists to prevent", () => {
  const ctx = context({
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    chain: "ethereum",
    verified: true,
    source: USDT_SOURCE,
    contractName: "TetherToken",
    owner: "0x5754284f345afc66a98fbb0a0afe71e0f007b949",
    ownerIsContract: false,
  });

  const findings = runChecks(ctx);
  const result = verdictFor(findings);

  it("still detects every owner power — nothing was weakened", () => {
    expect(ids(findings)).toContain("honeypot.blacklist_mapping");
    expect(ids(findings)).toContain("mint.unlimited");
    expect(ids(findings)).toContain("ownership.pausable");
  });

  it("is NOT danger", () => {
    expect(result.verdict).not.toBe("DANGER");
    expect(result.headline).not.toBe("Do not sign");
  });

  it("is a disclosure: here is what this can do", () => {
    expect(result.verdict).toBe("CAUTION");
    expect(result.headline).toBe("What this can do");
    expect(result.lede).toContain("Nothing here says scam");
  });

  it("shows the findings rather than hiding them", () => {
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(" ")).toMatch(/freeze|make new tokens|pause/i);
  });

  it("hands the decision back instead of making it", () => {
    expect(result.whatToDo).toMatch(/if you know and trust/i);
  });

  it("lands correctly WITHOUT the allowlist — the tiers are the fix", () => {
    // Same findings, an address nobody has ever heard of.
    const unknown = verdictFor(runChecks(context({ ...ctx, address: "0xdeadbeef".padEnd(42, "0") })));
    expect(unknown.verdict).toBe("CAUTION");
    expect(unknown.headline).toBe("What this can do");
    expect(isWellKnown("ethereum", "0xdeadbeef".padEnd(42, "0"))).toBe(false);
  });

  it("the allowlist is context only, and never a verdict", () => {
    expect(isWellKnown("ethereum", "0xdac17f958d2ee523a2206206994597c13d831ec7")).toBe(true);
    // Tagged or not, the verdict is identical.
    expect(verdictFor(findings).verdict).toBe(verdictFor(findings).verdict);
  });
});

describe("a real honeypot — code that blocks everyone", () => {
  it("is DANGER when only the owner can ever transfer", () => {
    const findings = honeypotChecks(
      context({
        source:
          "function _transfer(address from, address to, uint256 v) internal { require(from == owner, 'locked'); }",
      }),
    );
    expect(findings[0].kind).toBe("fact");

    const result = verdictFor(findings);
    expect(result.verdict).toBe("DANGER");
    expect(result.headline).toBe("Do not sign");
    expect(result.lede).toMatch(/honeypot/i);
  });

  it("is DANGER when the sell fee takes everything", () => {
    const findings = honeypotChecks(context({ source: "uint256 private _sellTax = 100;" }));
    expect(verdictFor(findings).verdict).toBe("DANGER");
  });
});

describe("a scam-list address", () => {
  it("is DANGER on the list alone, with no code needed", () => {
    const result = buildVerdict({
      kind: "contract",
      verified: false,
      findings: [],
      scam: { ...CLEAN_SCAN, addressListed: true },
    });
    expect(result.verdict).toBe("DANGER");
    expect(result.headline).toBe("Do not sign");
  });
});

describe("a plausible new token nobody has listed", () => {
  const findings = mintableChecks(
    context({ source: "function mint(address to, uint256 amount) external onlyOwner {}" }),
  );

  it("discloses the mint power without calling it a scam", () => {
    const result = verdictFor(findings);
    expect(result.verdict).toBe("CAUTION");
    expect(result.headline).toBe("What this can do");
    expect(result.reasons.join(" ")).toMatch(/depends who runs it/i);
  });

  it("is not rescued by, or dependent on, any allowlist", () => {
    expect(isWellKnown("ethereum", "0x1111111111111111111111111111111111111111")).toBe(false);
    expect(verdictFor(findings).verdict).toBe("CAUTION");
  });
});

describe("a clean, renounced token", () => {
  const result = verdictFor([]);

  it("says no red flags, and never says safe", () => {
    expect(result.verdict).toBe("SAFE");
    expect(result.headline).toBe("No red flags");
    expect(`${result.headline} ${result.lede} ${result.whatToDo}`).not.toMatch(/\bis safe\b/i);
  });

  it("hands the call back to the user", () => {
    expect(result.reasons.join(" ")).toMatch(/still your call/i);
  });
});

describe("certainty, never implied", () => {
  it("a clean scam-list result never reads as safe", () => {
    const result = buildVerdict({
      kind: "link",
      verified: false,
      findings: [],
      scam: CLEAN_SCAN,
    });
    expect(result.verdict).toBe("CAUTION");
    expect(result.lede).toMatch(/not the same as being safe/i);
    expect(result.lede).toMatch(/new scam is on no list yet/i);
  });

  it("no capability, however many, can reach DANGER", () => {
    const many: Finding[] = [
      "honeypot.blacklist_mapping",
      "mint.unlimited",
      "ownership.pausable",
      "ownership.upgradeable_eoa_owner",
      "approvals.arbitrary_call",
    ].map((id) => ({ id, kind: "capability", severity: "high", humanReason: `${id} power` }));

    expect(verdictFor(many).verdict).toBe("CAUTION");
  });
});
