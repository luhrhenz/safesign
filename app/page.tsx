import Link from "next/link";
import { Checker } from "@/components/Checker";
import { Mark } from "@/components/icons";
import { SUPPORT_URL, SUPPORTED_CHAIN_LABELS } from "@/lib/config";

/**
 * Server-rendered shell — only the form and result hydrate, so the question and
 * the input are on screen before any JavaScript arrives.
 */
export default function Page() {
  return (
    <main>
      <header className="masthead">
        <Mark />
        <span className="wordmark">
          Safe<span>Sign</span>
        </span>
      </header>

      <h1 className="ask">Is this safe to sign?</h1>
      <p className="standfirst">
        Paste a coin&rsquo;s name, its address, or the link you were sent. You get a straight
        answer before you approve anything.
      </p>

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
