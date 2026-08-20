"use client";

import { useEffect, useState } from "react";
import { creditBalanceChangedEvent } from "@/lib/credit-balance-events";

/**
 * The account's credit balance, kept level with the badge in the header.
 *
 * Both generators need it for one decision: whether a low balance should grey
 * out the Generate button. That answer must never be guessed — null means "not
 * known yet", and nothing is blocked on a null, because blocking someone out of
 * a generation we were never going to charge them for is the worse error.
 */
export function useCreditBalance(enabled: boolean): number | null {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      fetch("/api/credits", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (!active || !body) return;
          setBalance(typeof body.credits === "number" ? body.credits : null);
        })
        .catch(() => {
          // Left unknown rather than assumed zero, which would block the button.
        });
    };
    load();
    // Every generation dispatches this once it settles, so the two pages and
    // the header badge cannot drift apart after a charge or a refund.
    window.addEventListener(creditBalanceChangedEvent, load);
    return () => {
      active = false;
      window.removeEventListener(creditBalanceChangedEvent, load);
    };
  }, [enabled]);

  return balance;
}
