/**
 * Every icon in the app, as inline SVG. No icon library, no sprite sheet, no
 * font — four glyphs at 16–22px, drawn from primitives so they stay legible on
 * a cheap screen. `currentColor` throughout, so the CSS decides the meaning.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** The mark: a shield with a scan line through it. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" {...stroke} />
      <path d="M8 12h8" {...stroke} />
    </svg>
  );
}

/** Verdict glyphs. Shape carries the meaning too, not colour alone. */
export function VerdictIcon({ verdict }: { verdict: "SAFE" | "CAUTION" | "DANGER" }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true };

  if (verdict === "SAFE") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" {...stroke} />
        <path d="m8 12 3 3 5-6" {...stroke} />
      </svg>
    );
  }

  if (verdict === "CAUTION") {
    return (
      <svg {...common}>
        <path d="M12 4 3 19h18L12 4Z" {...stroke} />
        <path d="M12 10v4" {...stroke} />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M15 9 9 15M9 9l6 6" {...stroke} />
    </svg>
  );
}

/** Check-list marks: pass, flag, and "we could not look". */
export function CheckIcon({ status }: { status: "flag" | "pass" | "unchecked" }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true };

  if (status === "pass") {
    return (
      <svg {...common}>
        <path d="m3 8.5 3 3 7-8" {...stroke} />
      </svg>
    );
  }

  if (status === "flag") {
    return (
      <svg {...common}>
        <path d="M8 2.5 1.5 14h13L8 2.5Z" {...stroke} />
        <path d="M8 7v3" {...stroke} />
        <circle cx="8" cy="11.8" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6" strokeDasharray="2 2" {...stroke} />
      <path d="M5.5 8h5" {...stroke} />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" {...stroke} />
      <path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7" {...stroke} />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9 3h4v4M13 3 7.5 8.5" {...stroke} />
      <path d="M12 10v2.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H6" {...stroke} />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 10.5V2.5M5 5.5 8 2.5l3 3" {...stroke} />
      <path d="M3 9v3.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" {...stroke} />
    </svg>
  );
}
