import { describe, expect, it } from "vitest";
import { honeypotChecks } from "../lib/checks/honeypot";
import { mintableChecks } from "../lib/checks/mintable";
import { ownershipChecks } from "../lib/checks/ownership";
import { approvalChecks } from "../lib/checks/approvals";
import { runChecks } from "../lib/checks";
import { context, ids } from "./helpers";

describe("honeypot rules", () => {
  it("flags a blacklist mapping", () => {
    const findings = honeypotChecks(
      context({ source: "mapping(address => bool) private _blacklisted;" }),
    );
    expect(ids(findings)).toContain("honeypot.blacklist_mapping");
    expect(findings[0].severity).toBe("high");
  });

  it("flags a trading on/off switch", () => {
    const findings = honeypotChecks(
      context({ source: "function enableTrading(bool value) external onlyOwner { }" }),
    );
    expect(ids(findings)).toContain("honeypot.trading_switch");
  });

  it("flags a transfer that only some wallets are allowed to make", () => {
    const findings = honeypotChecks(
      context({ source: "function _transfer() internal { require(tradingEnabled, 'no'); }" }),
    );
    expect(ids(findings)).toContain("honeypot.transfer_restriction");
  });

  it("treats an uncapped fee setter as worse than a capped one", () => {
    const uncapped = honeypotChecks(
      context({ source: "function setSellFee(uint256 fee) external onlyOwner { sellFee = fee; }" }),
    );
    const capped = honeypotChecks(
      context({
        source:
          "function setSellFee(uint256 fee) external onlyOwner { require(fee <= 5, 'max'); sellFee = fee; }",
      }),
    );
    expect(uncapped.find((f) => f.id === "honeypot.mutable_fees")?.severity).toBe("high");
    expect(capped.find((f) => f.id === "honeypot.mutable_fees")?.severity).toBe("medium");
  });

  it("ignores red-flag words that only appear in comments", () => {
    const findings = honeypotChecks(
      context({ source: "// no blacklist here\n/* function enableTrading() */\ncontract A {}" }),
    );
    expect(findings).toEqual([]);
  });

  it("says nothing about a contract it cannot read", () => {
    expect(honeypotChecks(context({ verified: false, source: "" }))).toEqual([]);
  });
});

describe("mint rules", () => {
  it("flags an uncapped mint as high", () => {
    const findings = mintableChecks(
      context({ source: "function mint(address to, uint256 amount) external onlyOwner {}" }),
    );
    expect(findings[0].id).toBe("mint.unlimited");
    expect(findings[0].severity).toBe("high");
  });

  it("downgrades a mint with a supply cap", () => {
    const findings = mintableChecks(
      context({
        source:
          "uint256 public maxSupply = 1000;\nfunction mint(address to, uint256 amount) external {}",
      }),
    );
    expect(findings[0].id).toBe("mint.capped");
    expect(findings[0].severity).toBe("low");
  });

  it("finds a mint through the ABI when the source misses it", () => {
    const findings = mintableChecks(
      context({
        source: "contract A {}",
        abi: [{ type: "function", name: "mint", stateMutability: "nonpayable" }],
      }),
    );
    expect(findings[0].id).toBe("mint.unlimited");
  });

  it("does not flag a read-only function called mint", () => {
    const findings = mintableChecks(
      context({
        source: "contract A {}",
        abi: [{ type: "function", name: "mint", stateMutability: "view" }],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe("ownership rules", () => {
  it("treats an upgradeable contract owned by a personal wallet as high", () => {
    const findings = ownershipChecks(
      context({
        proxy: { isProxy: true, implementation: "0xabc" },
        owner: "0xdef",
        ownerIsContract: false,
      }),
    );
    expect(ids(findings)).toContain("ownership.upgradeable_eoa_owner");
    expect(findings[0].severity).toBe("high");
  });

  it("is softer when the owner is itself a contract", () => {
    const findings = ownershipChecks(
      context({
        proxy: { isProxy: true, implementation: "0xabc" },
        owner: "0xdef",
        ownerIsContract: true,
      }),
    );
    expect(ids(findings)).toContain("ownership.upgradeable");
    expect(ids(findings)).toContain("ownership.owner_is_contract");
    expect(ids(findings)).not.toContain("ownership.not_renounced");
  });

  it("flags an owner that has not renounced", () => {
    const findings = ownershipChecks(context({ owner: "0xdef", ownerIsContract: false }));
    expect(ids(findings)).toContain("ownership.not_renounced");
  });

  it("says nothing about ownership when owner() is renounced", () => {
    expect(ownershipChecks(context({ owner: null }))).toEqual([]);
  });

  it("flags pause powers and selfdestruct", () => {
    const findings = ownershipChecks(
      context({ source: "function pause() external onlyOwner { selfdestruct(payable(owner)); }" }),
    );
    expect(ids(findings)).toContain("ownership.pausable");
    expect(ids(findings)).toContain("ownership.selfdestruct");
  });

  it("still works on a contract with no published source", () => {
    const findings = ownershipChecks(
      context({ verified: false, source: "", owner: "0xdef", ownerIsContract: false }),
    );
    expect(ids(findings)).toContain("ownership.not_renounced");
  });
});

describe("approval / drainer rules", () => {
  it("flags a loop that pulls tokens from many wallets", () => {
    const findings = approvalChecks(
      context({
        source:
          "function sweep(address[] calldata users) external { for (uint i; i < users.length; i++) { token.transferFrom(users[i], msg.sender, 1); } }",
      }),
    );
    expect(ids(findings)).toContain("approvals.batch_transfer_from");
  });

  it("flags a caller-supplied call target", () => {
    const findings = approvalChecks(
      context({ source: "function exec(address t, bytes calldata data) external { t.call(data); }" }),
    );
    expect(ids(findings)).toContain("approvals.arbitrary_call");
  });

  it("flags permit followed by transferFrom", () => {
    const findings = approvalChecks(
      context({ source: "token.permit(owner, spender, v, r, s); token.transferFrom(a, b, c);" }),
    );
    expect(ids(findings)).toContain("approvals.permit_forwarding");
  });

  it("leaves a plain transfer alone", () => {
    expect(approvalChecks(context())).toEqual([]);
  });
});

describe("aggregation", () => {
  it("reports an address with no code as a wallet and stops", () => {
    const findings = runChecks(context({ bytecode: "0x", verified: false, source: "" }));
    expect(ids(findings)).toEqual(["meta.not_a_contract"]);
  });

  it("always records unpublished source", () => {
    const findings = runChecks(context({ verified: false, source: "" }));
    expect(ids(findings)).toContain("meta.unverified_source");
  });

  it("distinguishes 'we could not check' from 'not published'", () => {
    const findings = runChecks(
      context({ verified: false, source: "", sourceLookupInconclusive: true }),
    );
    expect(ids(findings)).toContain("meta.source_unavailable");
    expect(ids(findings)).not.toContain("meta.unverified_source");
  });

  it("sorts the worst finding first", () => {
    const findings = runChecks(
      context({
        source: "function mint(address to, uint256 a) external {}",
        owner: "0xdef",
        ownerIsContract: false,
      }),
    );
    expect(findings[0].severity).toBe("high");
  });

  it("never repeats a rule id", () => {
    const findings = runChecks(
      context({
        source:
          "mapping(address => bool) private _blacklisted;\nmapping(address => bool) private _isBot;",
      }),
    );
    expect(new Set(ids(findings)).size).toBe(findings.length);
  });
});
