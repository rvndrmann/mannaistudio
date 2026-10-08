"use client";

import { useEffect, useState } from "react";

/** Provider metadata and effective billing policy. Secrets never reach this hook.
 * Until the policy loads, generation controls require keys; a network failure
 * must not promise platform billing to a BYOK-only subscriber.
 */
export function useProviderBillingPolicy() {
  const [providers, setProviders] = useState<string[]>([]);
  const [ownKeysOnly, setOwnKeysOnly] = useState(true);

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
        setOwnKeysOnly(Boolean(data.ownKeysOnly));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return { providers, ownKeysOnly };
}

export function useConnectedProviders(): string[] {
  return useProviderBillingPolicy().providers;
}
