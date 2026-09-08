import type { CheckResponse } from "@/lib/types";

const CLASS_BY_VERDICT = {
  SAFE: "verdict-safe",
  CAUTION: "verdict-caution",
  DANGER: "verdict-danger",
} as const;

const HEADLINE_BY_VERDICT = {
  SAFE: "Looks safe",
  CAUTION: "Be careful",
  DANGER: "Do not sign",
} as const;

export function VerdictCard({ result }: { result: CheckResponse }) {
  const { subject } = result;

  return (
    <section className="verdict" aria-live="polite">
      <div className={`verdict-banner ${CLASS_BY_VERDICT[result.verdict]}`}>
        <span className="verdict-light" aria-hidden="true" />
        {HEADLINE_BY_VERDICT[result.verdict]}
      </div>

      <div className="verdict-body">
        <ul>
          {result.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>

        <p className="what-to-do">{result.whatToDo}</p>

        <p className="subject">
          {subject.kind === "link" ? (
            <>Site checked: {subject.domain}</>
          ) : (
            <>
              {subject.contractName ? `${subject.contractName} · ` : ""}
              {subject.chainLabel ?? "unknown network"} ·{" "}
              {subject.verified ? "code published" : "code not published"}
              <br />
              {subject.explorerUrl ? (
                <a href={subject.explorerUrl} target="_blank" rel="noopener noreferrer">
                  {subject.address}
                </a>
              ) : (
                subject.address
              )}
            </>
          )}
        </p>

        {result.notes && result.notes.length > 0 && (
          <p className="provenance">{result.notes.join(" ")}</p>
        )}

        {result.findings.length > 0 && (
          <details>
            <summary>What we checked ({result.findings.length})</summary>
            <ul>
              {result.findings.map((finding) => (
                <li key={finding.id}>{finding.humanReason}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
