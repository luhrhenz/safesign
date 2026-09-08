import type { CheckContext } from "../lib/types";

/** A contract with verified source, no owner, no proxy — override what you test. */
export function context(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    address: "0x1111111111111111111111111111111111111111",
    chain: "celo",
    verified: true,
    source: "contract Token { function transfer(address to, uint256 amount) public {} }",
    contractName: "Token",
    abi: null,
    bytecode: "0x6080604052",
    owner: null,
    ownerIsContract: null,
    proxy: { isProxy: false, implementation: null },
    ...overrides,
  };
}

export function ids(findings: { id: string }[]): string[] {
  return findings.map((f) => f.id);
}
