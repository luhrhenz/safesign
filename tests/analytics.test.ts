import { describe, expect, it } from "vitest";
import { countersSettled, readCounters, recordCheck, recordRejection } from "../lib/analytics";

/** Counters share the cache's in-memory fallback, so this exercises the real path. */
const settle = countersSettled;

describe("durable counters", () => {
  it("counts a check, its verdict, and the address behind it", async () => {
    const before = await readCounters();

    recordCheck({
      kind: "address",
      chain: "celo",
      verdict: "CAUTION",
      engine: "rules",
      address: "0xABC0000000000000000000000000000000000001",
      findingCount: 2,
      cached: false,
      miniPay: true,
      durationMs: 10,
    });
    await settle();

    const after = await readCounters();
    expect(after.checks).toBe(before.checks + 1);
    expect(after.verdicts.CAUTION).toBe(before.verdicts.CAUTION + 1);
    expect(after.miniPayChecks).toBe(before.miniPayChecks + 1);
    expect(after.distinctAddresses).toBe(before.distinctAddresses + 1);
    expect(after.lastSeenAt).not.toBe("");
  });

  it("does not count the same address twice, however often it is checked", async () => {
    const event = {
      kind: "address" as const,
      chain: "celo",
      verdict: "SAFE" as const,
      engine: "rules",
      address: "0xrepeat0000000000000000000000000000000001",
      findingCount: 0,
      cached: false,
      miniPay: false,
      durationMs: 5,
    };

    recordCheck(event);
    await settle();
    const once = await readCounters();

    recordCheck(event);
    recordCheck({ ...event, address: event.address.toUpperCase() });
    await settle();
    const twice = await readCounters();

    expect(twice.checks).toBe(once.checks + 2);
    expect(twice.distinctAddresses).toBe(once.distinctAddresses);
  });

  it("counts rejected input separately from checks", async () => {
    const before = await readCounters();
    recordRejection("stellar");
    await settle();
    const after = await readCounters();

    expect(after.rejections).toBe(before.rejections + 1);
    expect(after.checks).toBe(before.checks);
  });
});
