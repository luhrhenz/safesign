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

describe("counters do not expire", () => {
  it("stores the totals with no TTL, unlike a verdict", async () => {
    const writes: unknown[][] = [];
    const original = globalThis.fetch;

    // Stand in for Upstash so the command itself can be inspected.
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "token";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      if (init?.body) writes.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      recordRejection("generic");
      await countersSettled();

      const setCommand = writes.find((w) => w[0] === "SET" && String(w[1]).includes("counters"));
      expect(setCommand).toBeDefined();
      // ["SET", key, value] with no "EX" — a verdict would have one.
      expect(setCommand).toHaveLength(3);
      expect(setCommand).not.toContain("EX");
    } finally {
      globalThis.fetch = original;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
    }
  });
});

describe("per-chain counts", () => {
  const event = (chain: string | undefined) => ({
    kind: "address" as const,
    chain,
    verdict: "CAUTION" as const,
    engine: "rules",
    findingCount: 0,
    cached: false,
    miniPay: false,
    durationMs: 5,
  });

  it("attributes each check to the chain it ran on", async () => {
    // Drain anything an earlier test left queued, so this measures only ours.
    await settle();
    const before = await readCounters();

    await recordCheck({ ...event("celo"), address: "0xaaa0000000000000000000000000000000000001" });
    await recordCheck({ ...event("celo"), address: "0xaaa0000000000000000000000000000000000002" });
    await recordCheck({ ...event("base"), address: "0xaaa0000000000000000000000000000000000003" });
    await settle();

    const after = await readCounters();
    expect(after.chains.celo).toBe((before.chains.celo ?? 0) + 2);
    expect(after.chains.base).toBe((before.chains.base ?? 0) + 1);
  });

  it("counts a check with no chain without inventing one", async () => {
    await settle();
    const before = await readCounters();

    await recordCheck({ ...event(undefined), address: "0xaaa0000000000000000000000000000000000004" });
    await settle();

    const after = await readCounters();
    expect(after.checks).toBe(before.checks + 1);
    // Nothing new appeared in the per-chain breakdown.
    expect(Object.keys(after.chains).length).toBe(Object.keys(before.chains).length);
  });
});
