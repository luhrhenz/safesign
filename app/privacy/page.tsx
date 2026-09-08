import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export const metadata = { title: `Privacy — ${APP_NAME}` };

export default function PrivacyPage() {
  return (
    <main>
      <header>
        <h1>Privacy</h1>
      </header>

      <p>
        {APP_NAME} does not have accounts, and does not store what you check. There is no
        database.
      </p>

      <h2>What happens when you check something</h2>
      <p>
        The address or link you paste is sent to our server, which passes it to public
        services in order to answer: a block explorer (Etherscan) for the published code,
        public blockchain nodes to read what is on chain, public scam lists (ScamSniffer,
        MetaMask), and Anthropic&rsquo;s API to turn the findings into plain language. Those
        services receive the address or domain you pasted, and nothing else about you.
      </p>

      <h2>What we keep</h2>
      <p>
        A single line in our server log for each check: the network, the result, how many
        red flags were found, and how long it took. It contains no wallet address, no IP
        address and no identifier for you. We use it only to count how many people the tool
        is helping.
      </p>

      <h2>Your wallet</h2>
      <p>
        {APP_NAME} never asks for your wallet address, never asks you to connect, and can
        never ask you to sign or send anything. If a page claiming to be {APP_NAME} asks you
        to sign something, it is not us.
      </p>

      <footer>
        <p>
          <Link href="/">Back to the checker</Link>
        </p>
      </footer>
    </main>
  );
}
