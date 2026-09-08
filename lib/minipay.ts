/**
 * MiniPay detection (client-side only).
 *
 * Verified against docs.minipay.xyz on 2026-09-08: MiniPay injects an
 * EIP-1193 provider at `window.ethereum` and marks it with `isMiniPay === true`.
 *
 * We deliberately do NOT call `eth_requestAccounts`. SafeSign never asks for a
 * signature or sends a transaction, so it has no reason to read the user's
 * address — and the listing rule ("no manual connection button") is about not
 * making the user connect, which this app never does. If a later version needs
 * the address (e.g. "check what I have approved"), request it then.
 */

interface InjectedProvider {
  isMiniPay?: boolean;
}

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  const provider = (window as { ethereum?: InjectedProvider }).ethereum;
  return provider?.isMiniPay === true;
}
