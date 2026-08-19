"use client";

import { useEffect, useState } from "react";

/**
 * Which providers this user has connected their own key for.
 *
 * Read once per panel from the integrations endpoint, which returns metadata
 * only — never a key, never ciphertext. The list decides what the generate
 * button says and whether a credit balance may block it, so it has to come from
 * the same source the server bills from rather than from anything the page
 * guesses.
 *
 * An empty list on failure is the safe default: the user is shown the credit
 * price and charged the credit price. Guessing the other way would promise a
 * free generation and then take credits for it.
 */
export function useConnectedProviders(): string[] {
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/studio/integrations", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const connected = (data.providers || [])
          .filter((row: { connected?: boolean }) => row.connected)
          .map((row: { provider: string }) => row.provider);
        setProviders(connected);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return providers;
}
