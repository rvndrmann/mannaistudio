"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Zap } from "lucide-react";

/**
 * The switch between paying with studio credits and paying your own provider.
 *
 * In the header rather than only on the integrations page because it decides
 * what every generation and every chat turn costs, and a setting with that
 * reach should be visible while you work — not somewhere you have to remember
 * to go and check. Which mode is in force was invisible until now, and one
 * account had it on without anyone noticing, which turned every chat turn into
 * a refusal that read like a bug.
 *
 * Renders nothing until it knows the answer. A control that guesses and
 * corrects itself is worse than one that arrives a moment late, because the
 * wrong state here means the user believes they are being charged when they are
 * not, or the reverse.
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
      onClick={() => void toggle()}
      disabled={saving}
      title={ownKeysOnly
        ? "Running on your own provider keys. Studio credits are never spent, and a provider you have not connected is refused. Click to allow studio credits."
        : "Running on studio credits where you have not connected a key. Click to use only your own keys."}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50 ${
        ownKeysOnly
          ? "border-[#b9f42e]/40 bg-[#b9f42e]/10 text-[#b9f42e] hover:bg-[#b9f42e]/20"
          : "border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {ownKeysOnly ? <KeyRound className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
      <span className={compact ? "hidden lg:inline" : ""}>
        {ownKeysOnly ? "My keys only" : "Studio credits"}
      </span>
    </button>
  );
}
