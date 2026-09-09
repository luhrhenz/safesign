import { beforeEach, describe, expect, it } from "vitest";
import { callerKey, checkRateLimit, resetRateLimit } from "../lib/rateLimit";

describe("rate limit", () => {
  beforeEach(resetRateLimit);

  it("allows a normal burst of checks", () => {
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit("someone").allowed).toBe(true);
    }
  });

  it("stops the twenty-first in the same minute", () => {
    for (let i = 0; i < 20; i++) checkRateLimit("someone");
    const blocked = checkRateLimit("someone");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("lets them back in once the window passes", () => {
    const start = 1_000_000;
    for (let i = 0; i < 21; i++) checkRateLimit("someone", start);
    expect(checkRateLimit("someone", start).allowed).toBe(false);
    expect(checkRateLimit("someone", start + 61_000).allowed).toBe(true);
  });

  it("counts callers separately", () => {
    for (let i = 0; i < 21; i++) checkRateLimit("noisy");
    expect(checkRateLimit("noisy").allowed).toBe(false);
    expect(checkRateLimit("quiet").allowed).toBe(true);
  });

  it("takes the client from the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" });
    expect(callerKey(headers)).toBe("203.0.113.9");
  });

  it("shares one bucket when it cannot tell callers apart", () => {
    expect(callerKey(new Headers())).toBe("anonymous");
  });
});
