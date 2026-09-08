/** Minimal JSON-RPC helper. No web3 library — keeps the serverless bundle small. */

export async function rpcCall(
  urls: string[],
  method: string,
  params: unknown[],
  timeoutMs = 6000,
): Promise<string | null> {
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) continue;
      const data = await res.json();
      if (data?.error) continue;
      if (typeof data?.result === "string") return data.result;
    } catch {
      // Try the next endpoint. A dead public RPC must never fail the whole check.
    }
  }
  return null;
}

/** eth_call against a 4-byte selector with no arguments (owner(), paused(), ...). */
export async function callSelector(
  urls: string[],
  to: string,
  selector: string,
): Promise<string | null> {
  return rpcCall(urls, "eth_call", [{ to, data: selector }, "latest"]);
}

/** Last 20 bytes of a 32-byte word, as a 0x address. Null for the zero word. */
export function wordToAddress(word: string | null): string | null {
  if (!word || word.length < 66) return null;
  const addr = "0x" + word.slice(-40).toLowerCase();
  return addr === "0x0000000000000000000000000000000000000000" ? null : addr;
}
