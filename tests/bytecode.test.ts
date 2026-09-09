import { describe, expect, it } from "vitest";
import { bytecodeChecks, extractSelectors } from "../lib/checks/bytecode";
import { context, ids } from "./helpers";

/** A dispatcher fragment: PUSH4 <selector> for each function, as solc emits. */
const dispatcher = (...selectors: string[]) =>
  "0x6080604052" + selectors.map((s) => `63${s.replace(/^0x/, "")}`).join("8114") + "5b00";

describe("selector extraction", () => {
  it("finds every PUSH4 selector in a dispatcher", () => {
    const found = extractSelectors(dispatcher("0x5fba79f5", "0x40c10f19"));
    expect(found.has("0x5fba79f5")).toBe(true);
    expect(found.has("0x40c10f19")).toBe(true);
  });

  it("copes with bytecode that has no 0x prefix", () => {
    expect(extractSelectors("6380ac58cd").has("0x80ac58cd")).toBe(true);
  });

  it("returns nothing for an empty account", () => {
    expect(extractSelectors("0x").size).toBe(0);
  });
});

describe("reading a contract with no published source", () => {
  const unverified = (bytecode: string) =>
    bytecodeChecks(context({ verified: false, source: "", bytecode }));

  it("recognises the interface of a fake-airdrop drainer", () => {
    const findings = unverified(dispatcher("0x5fba79f5", "0x3158952e"));
    expect(ids(findings)).toContain("approvals.drainer_interface");
    expect(findings[0].humanReason).toMatch(/security update/i);
    // Still a capability: a real airdrop can have a Claim() too.
    expect(findings[0].kind).toBe("capability");
  });

  it("reports owner powers it can see in the interface", () => {
    const findings = unverified(dispatcher("0x40c10f19", "0x8456cb59", "0x0ecb93c0"));
    expect(ids(findings)).toContain("mint.unpublished_power");
    expect(ids(findings)).toContain("ownership.unpublished_power");
    expect(ids(findings)).toContain("honeypot.unpublished_power");
  });

  it("reports a family once, however many spellings of the power it finds", () => {
    // Three different blacklist signatures, one finding.
    const findings = unverified(dispatcher("0xf9f92be4", "0x0ecb93c0", "0x153b0d1e"));
    expect(findings.filter((f) => f.id === "honeypot.unpublished_power")).toHaveLength(1);
  });

  it("flags sweeping interfaces", () => {
    expect(ids(unverified(dispatcher("0xac9650d8")))).toContain("approvals.batch_interface");
  });

  it("says nothing about an ordinary unpublished contract", () => {
    expect(unverified(dispatcher("0x70a08231", "0x23b872dd"))).toEqual([]);
  });

  it("leaves owner powers to the source rules when there is source", () => {
    const findings = bytecodeChecks(
      context({ verified: true, source: "contract A {}", bytecode: dispatcher("0x40c10f19") }),
    );
    expect(findings).toEqual([]);
  });

  it("still reads the interface of a VERIFIED drainer", () => {
    // The benchmark's real miss: source published, nothing for the source rules
    // to match, and a drainer interface sitting in plain sight.
    const findings = bytecodeChecks(
      context({ verified: true, source: "contract A {}", bytecode: dispatcher("0x5fba79f5") }),
    );
    expect(ids(findings)).toContain("approvals.drainer_interface");
  });
});

describe("what the contract calls itself", () => {
  it("treats a self-declared security update as a fact", () => {
    const findings = bytecodeChecks(
      context({ verified: true, contractName: "SecurityUpdates", bytecode: dispatcher("0x5fba79f5") }),
    );
    const identity = findings.find((f) => f.id === "approvals.phishing_identity");
    expect(identity?.kind).toBe("fact");
    expect(identity?.humanReason).toMatch(/never ask you to run one/i);
  });

  it("does not double-report the same trick twice", () => {
    const findings = bytecodeChecks(
      context({ verified: true, contractName: "SecurityUpdate", bytecode: dispatcher("0x5fba79f5") }),
    );
    expect(ids(findings)).not.toContain("approvals.drainer_interface");
  });

  it("is softer on a name a real project might use", () => {
    const findings = bytecodeChecks(
      context({ verified: true, contractName: "Airdrop", bytecode: dispatcher("0x70a08231") }),
    );
    expect(findings[0].id).toBe("approvals.bait_identity");
    expect(findings[0].kind).toBe("capability");
  });

  it("leaves ordinary contract names alone", () => {
    for (const contractName of ["TetherToken", "WETH9", "MerkleDistributor", "StableTokenProxy"]) {
      const findings = bytecodeChecks(
        context({ verified: true, contractName, bytecode: dispatcher("0x70a08231") }),
      );
      expect(findings).toEqual([]);
    }
  });

  it("stays quiet for an address with no code at all", () => {
    expect(bytecodeChecks(context({ verified: false, source: "", bytecode: "0x" }))).toEqual([]);
  });
});
