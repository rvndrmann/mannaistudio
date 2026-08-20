"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The switch between paying with studio credits and paying your own provider.
 *
 * In the header rather than only on the integrations page because it decides
 * what every generation and every chat turn costs, and a setting with that
 * reach should be visible while you work. One account had it on without anyone
 * noticing, which turned every chat turn into a refusal that read like a bug.
 *
 * Drawn as a switch with a fixed label rather than a button whose text changes.
 * A control reading "Studio credits" cannot tell you whether that is the state
 * it is in or the state it will move to, and this one changed its colour at the
 * same time, so neither half disambiguated the other. A switch has a position,
 * and the position is the answer.
 *
 * Renders nothing until it knows that position. A control that guesses and
 * corrects itself would tell the user they are being charged when they are not,
 * or the reverse.
 */
export function BillingModeToggle({ compact = false }: { compact?: boolean }) {
  const [ownKeysOnly, setOwnKeysOnly] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/studio/integrations", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (data.configured === false) return;
      setOwnKeysOnly(Boolean(data.ownKeysOnly));
    } catch {
      // Left unknown, so nothing is claimed about how the user is billed.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (ownKeysOnly === null) return null;

  const toggle = async () => {
    const next = !ownKeysOnly;
    setSaving(true);
    setOwnKeysOnly(next);
    try {
      const response = await fetch("/api/studio/integrations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownKeysOnly: next }),
      });
      // Put it back rather than showing a setting that is not in force.
      if (!response.ok) setOwnKeysOnly(!next);
    } catch {
      setOwnKeysOnly(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ownKeysOnly}
      aria-label="Only my API"
      onClick={() => void toggle()}
      disabled={saving}
      title={ownKeysOnly
        ? "On — everything runs on your own provider keys. Studio credits are never spent, and a provider you have not connected is refused."
        : "Off — providers you have not connected run on studio credits."}
      className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-white/10 px-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white active:scale-[0.97] disabled:opacity-50"
    >
      <span className={compact ? "hidden xl:inline" : ""}>My API</span>

      {/* The switch itself: a track the knob sits at one end of. */}
      <span
        aria-hidden
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          ownKeysOnly ? "bg-[#b9f42e]" : "bg-white/20"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-black transition-transform ${
            ownKeysOnly ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>

      {/* Spelled out as well as shown: the position carries the meaning, but a
          two-letter word costs nothing and removes the last doubt. */}
      <span className={`text-xs font-semibold ${ownKeysOnly ? "text-[#b9f42e]" : "text-white/40"}`}>
        {ownKeysOnly ? "ON" : "OFF"}
      </span>
    </button>
  );
}
