"use client";

import { useState } from "react";
import type { CheckResponse } from "@/lib/types";
import { CheckIcon, CopyIcon, ExternalIcon, ShareIcon, VerdictIcon } from "./icons";

export function VerdictCard({ result }: { result: CheckResponse }) {
  const { subject, verdict } = result;
  const checks = result.checks ?? [];
  const flagged = checks.filter((c) => c.status === "flag").length;

  return (
    <section className={`result result-${verdict.toLowerCase()}`} aria-live="polite">
      <h2 className="verdict">
        <VerdictIcon verdict={verdict} />
        {result.headline}
      </h2>

      <p className="lede">{result.lede}</p>

      {result.reasons.length > 0 && (
        <ul className="reasons">
          {result.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}

      <Pills result={result} />

      {subject.kind === "address" && subject.address && (
        <AddressRow address={subject.address} explorerUrl={subject.explorerUrl} />
      )}

      {checks.length > 0 && (
        <details className="checks">
          <summary>
            What we checked
            <span className="tally">
              {flagged > 0 ? `${flagged} of ${checks.length} flagged` : `${checks.length} clear`}
            </span>
          </summary>
          <ul className="check-list">
            {checks.map((check) => (
              <li key={check.id} className={`check check-${check.status}`}>
                <CheckIcon status={check.status} />
                <div>
                  <div className="check-label">{check.label}</div>
                  <p className="check-detail">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {verdict === "DANGER" && <Share result={result} />}
    </section>
  );
}

function Pills({ result }: { result: CheckResponse }) {
  const { subject } = result;
  const pills: string[] = [];

  if (subject.chainLabel) pills.push(subject.chainLabel);
  if (subject.kind === "link" && subject.domain) pills.push(subject.domain);
  if (subject.contractName) pills.push(subject.contractName);

  if (subject.kind === "address") {
    pills.push(subject.verified ? "code published" : "code not published");
  }
  // Context for findings that read as alarming out of it.
  if (subject.wellKnown) pills.push("widely-used token");
  // Provenance, stated plainly: a partial match is still a match, but not an
  // exact one, and the reader deserves to know which they are looking at.
  if (subject.sourceConfidence === "medium") pills.push("partial match");
  if (result.cached) pills.push("cached");

  if (pills.length === 0) return null;

  return (
    <div className="pills">
      {pills.map((pill) => (
        <span className="pill" key={pill}>
          {pill}
        </span>
      ))}
    </div>
  );
}

function AddressRow({ address, explorerUrl }: { address: string; explorerUrl?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused in an in-app browser. Say nothing —
      // the address is on screen and can be selected by hand.
    }
  }

  return (
    <div className="addr">
      <code>{address}</code>
      <button type="button" className="icon-action" onClick={copy} aria-label="Copy address">
        {copied ? "✓" : <CopyIcon />}
      </button>
      {explorerUrl && (
        <a
          className="icon-action"
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in block explorer"
        >
          <ExternalIcon />
        </a>
      )}
    </div>
  );
}

/**
 * Sharing exists for one reason: a scam link travels through WhatsApp, so the
 * warning has to travel the same way. Offered on DANGER only — a share button
 * on every result trains people to ignore it.
 */
function Share({ result }: { result: CheckResponse }) {
  const [shared, setShared] = useState(false);
  const what = result.subject.address ?? result.subject.domain ?? "";
  const text = `Warning: SafeSign flagged this as DANGER. ${result.reasons[0] ?? ""} Do not sign it.\n\n${what}\n\nCheck anything before you sign:`;
  const url = typeof window === "undefined" ? "" : window.location.origin;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "SafeSign warning", text, url });
        setShared(true);
        return;
      }
    } catch {
      // Cancelled or unsupported — the links below still work.
    }
    setShared(true);
  }

  const message = encodeURIComponent(`${text} ${url}`);

  return (
    <div className="share">
      <button type="button" className="share-button" onClick={share}>
        <ShareIcon />
        Warn someone
      </button>

      {shared && (
        <div className="share-fallback">
          <a href={`https://wa.me/?text=${message}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Telegram
          </a>
        </div>
      )}
    </div>
  );
}
