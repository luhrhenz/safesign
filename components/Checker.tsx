"use client";

import { useCallback, useEffect, useState } from "react";
import type { CheckApiResponse, Verdict } from "@/lib/types";
import { shouldRenderVerdictCard } from "@/lib/types";
import { isMiniPay } from "@/lib/minipay";
import { VerdictCard } from "./VerdictCard";

/**
 * Real addresses, verified live. A first-timer with nothing to paste should
 * still see what the tool does — and both of these run through the normal
 * check, so what they see is a real result, not a canned one.
 */
const EXAMPLES = [
  {
    label: "A real scam",
    input: "0x101ce0cedd142f199c9ef61739ae59b6611a0fc0",
  },
  {
    label: "A clean token",
    input: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
];

const HISTORY_KEY = "safesign.history";
const HISTORY_MAX = 5;

interface HistoryEntry {
  input: string;
  label: string;
  verdict: Verdict;
}

export function Checker() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CheckApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  /** Device storage can be refused in an in-app browser; we say so if it is. */
  const [storageWorks, setStorageWorks] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      setStorageWorks(false);
    }
  }, []);

  const remember = useCallback((entry: HistoryEntry) => {
    setHistory((previous) => {
      const next = [entry, ...previous.filter((e) => e.input !== entry.input)].slice(
        0,
        HISTORY_MAX,
      );
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Keep it in memory for this session instead. Nothing is lost that the
        // user can see right now, and there is no backend to fall back to.
        setStorageWorks(false);
      }
      return next;
    });
  }, []);

  const check = useCallback(
    async (value: string) => {
      if (!value.trim()) return;

      setLoading(true);
      setError("");
      setResult(null);

      try {
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // miniPay only feeds the usage counter — it never changes the verdict.
          body: JSON.stringify({ input: value, miniPay: isMiniPay() }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Could not check that. Try again.");
          return;
        }

        const response = data as CheckApiResponse;
        setResult(response);

        if (response.status === "verdict") {
          remember({
            input: value.trim(),
            label: response.subject.address ?? response.subject.domain ?? value.trim(),
            verdict: response.verdict,
          });
        }
      } catch {
        setError("No connection. Check your data and try again.");
      } finally {
        setLoading(false);
      }
    },
    [remember],
  );

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!loading) check(input);
  }

  function runExample(value: string) {
    setInput(value);
    check(value);
  }

  return (
    <>
      {/* The beam lives on the panel: neutral at rest, travelling while we read. */}
      <div className={loading ? "panel panel-scanning" : "panel"}>
        <form onSubmit={onSubmit}>
          <label htmlFor="input" className="field-label">
            Address, link, or coin name
          </label>
          <textarea
            id="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…, a link, or the name of a coin"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <button type="submit" className="primary" disabled={loading || !input.trim()}>
            {loading ? "Reading the code…" : "Check it"}
          </button>
        </form>

        <div className="examples">
          <span>Nothing to paste?</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.input}
              type="button"
              className="example"
              disabled={loading}
              onClick={() => runExample(example.input)}
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && !result && !error && (
        <ol className="primer">
          <li>
            <span className="n">01</span>
            <span>
              <strong>We read the actual code</strong>
              Published source where it exists, the compiled contract where it does not.
            </span>
          </li>
          <li>
            <span className="n">02</span>
            <span>
              <strong>We check who controls it</strong>
              Whether anyone can freeze your balance, mint more, or swap the code out.
            </span>
          </li>
          <li>
            <span className="n">03</span>
            <span>
              <strong>We say it plainly</strong>
              No jargon, no score out of ten — and never &ldquo;safe&rdquo; when we cannot tell.
            </span>
          </li>
        </ol>
      )}

      {loading && (
        <div className="scanning" role="status">
          <i />
          <i />
          <i />
          <span>Reading the code…</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {/*
        Input we could not identify gets a plain message and nothing else — no
        traffic light, no "checked" line, no verdict. Saying "we checked this
        and it looks fine" about something we never parsed is the one failure
        this app cannot afford.
      */}
      {result?.status === "name_matches" && (
        <div className="unsupported name-matches" role="status">
          <p>
            {result.matches.length === 1
              ? `Found one token called "${result.query}". Names are not unique — make sure this is the right one before you continue:`
              : `Found ${result.matches.length} tokens called "${result.query}". Names are not unique — anyone can use one, including a scammer copying a real one. Pick the one you actually saw:`}
          </p>
          <ul className="match-list">
            {result.matches.map((m) => (
              <li key={`${m.chain}:${m.address}`}>
                <button
                  type="button"
                  className="match"
                  disabled={loading}
                  onClick={() => runExample(m.address)}
                >
                  <span className="match-name">
                    {m.name} <span className="match-symbol">{m.symbol}</span>
                  </span>
                  <span className="match-meta">
                    {m.chainLabel}
                    {m.marketCapRank ? ` · #${m.marketCapRank} by market cap` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="scope">None of these? It may not be on a chain we check yet.</p>
        </div>
      )}

      {result?.status === "unrecognized" && (
        <div className="unsupported" role="status">
          <p>{result.message}</p>
          <p className="scope">
            {result.hint ?? "Paste an address that starts with 0x, or a link."}
          </p>
        </div>
      )}

      {shouldRenderVerdictCard(result) && result?.status === "verdict" && (
        <VerdictCard result={result} />
      )}

      {history.length > 0 && (
        <section className="history">
          <h2>Recently checked</h2>
          <ul>
            {history.map((entry) => (
              <li key={entry.input}>
                <button type="button" onClick={() => runExample(entry.input)} disabled={loading}>
                  <span className={`tag tag-${entry.verdict}`}>{entry.verdict}</span>
                  <code>{entry.label}</code>
                </button>
              </li>
            ))}
          </ul>
          {!storageWorks && (
            <p className="note">
              This list clears when you close the app — your browser is not letting SafeSign
              save it on this device.
            </p>
          )}
        </section>
      )}
    </>
  );
}
