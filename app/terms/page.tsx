import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const metadata = { title: `Terms — ${APP_NAME}` };

export default function TermsPage() {
  return (
    <main>
      <header>
        <h1>Terms of use</h1>
      </header>

      <p>
        {APP_NAME} is a free safety check. You paste an address or a link, and it tells you
        what it found in the code, on the chain, and on public scam lists.
      </p>

      <h2>It is information, not a guarantee</h2>
      <p>
        A result of <strong>Looks safe</strong> means nothing dangerous was found in what
        could be checked. It does not promise that a token, contract or site is honest, that
        it will stay that way, or that you will not lose money. Contracts can be changed,
        owners can act later, and new scams appear every day.
      </p>
      <p>
        <strong>Be careful</strong> and <strong>Do not sign</strong> are warnings, not
        accusations. Decisions about your money remain yours.
      </p>

      <h2>No liability</h2>
      <p>
        {APP_NAME} is provided as is, with no warranty. We are not responsible for losses
        from acting, or not acting, on a result. If the answer and your own judgement
        disagree, do not sign.
      </p>

      <h2>Fair use</h2>
      <p>
        Do not use {APP_NAME} to attack the service or the public services it depends on.
        The code is open source; you are free to read it, run it, and check it yourself.
      </p>

      <footer>
        <p>
          <Link href="/">Back to the checker</Link>
        </p>
      </footer>
    </main>
  );
}
