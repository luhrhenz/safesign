"use client";

import { useState } from "react";
import type { CheckResponse } from "@/lib/types";
import { isMiniPay } from "@/lib/minipay";
import { VerdictCard } from "./VerdictCard";

export function Checker() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // miniPay only feeds the usage counter — it never changes the verdict.
        body: JSON.stringify({ input, miniPay: isMiniPay() }),
      });
      const data = await res.json();

      if (!res.ok) setError(data.error ?? "Could not check that. Try again.");
      else setResult(data as CheckResponse);
    } catch {
      setError("No connection. Check your data and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <label htmlFor="input" className="subject">
          Token address, contract address, or link
        </label>
        <textarea
          id="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x… or https://…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? "Checking…" : "Check it"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {result && <VerdictCard result={result} />}
    </>
  );
}
