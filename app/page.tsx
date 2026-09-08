import Link from "next/link";
import { Checker } from "@/components/Checker";
import { SUPPORT_URL, SUPPORTED_CHAIN_LABELS } from "@/lib/config";

/**
 * Server-rendered shell — only the form and result hydrate on the client, so
 * the page is readable before any JavaScript arrives.
 */
export default function Page() {
  return (
    <main>
      <header>
        <h1>Is this safe to sign?</h1>
        <p>Paste a token, a contract, or a link. We check it before you do.</p>
      </header>

      <Checker />

      <footer>
        <p>
          Checks published code, who controls it, and public scam lists across{" "}
          {SUPPORTED_CHAIN_LABELS}. It cannot catch everything — when in doubt, do not sign.
        </p>
        <p>
          <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            Support
          </a>
        </p>
      </footer>
    </main>
  );
}
