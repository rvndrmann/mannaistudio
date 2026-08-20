"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Connect, test, replace and disconnect provider keys.
 *
 * The form submits a secret exactly once. Nothing here keeps it afterwards —
 * no local state that outlives the request, no localStorage, no query string —
 * and there is nothing to read it back with, because no endpoint returns one.
 * What comes back is the masked metadata shown below.
 */

type ProviderPart = { key: string; label: string; hint?: string; optional: boolean };

type ProviderRow = {
  provider: string;
  label: string;
  helpUrl: string;
  parts: ProviderPart[];
  connected: boolean;
  keyLabel: string | null;
  last4: string | null;
  status: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
};

/**
 * Reads a response body that is supposed to be JSON but might not be.
 *
 * A route that threw before it could answer returns an empty body, and
 * `response.json()` on that throws a SyntaxError that took the whole page down
 * — so a misconfigured server looked like a broken form, with the real cause
 * only in the server log. The status is what tells us whether it worked; the
 * body is a nicety.
 */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function IntegrationsPanel() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [vaultReadable, setVaultReadable] = useState(true);
  const [ownKeysOnly, setOwnKeysOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ provider: string; text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/studio/integrations", { cache: "no-store" });
      if (!response.ok) return;
      const data = await readJson(response);
      setRows((data.providers as ProviderRow[]) || []);
      setConfigured(Boolean(data.configured));
      setVaultReadable(data.vaultReadable !== false);
      setOwnKeysOnly(Boolean(data.ownKeysOnly));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connect = async (row: ProviderRow) => {
    setBusy(row.provider);
    setMessage(null);
    try {
      const parts = Object.fromEntries(
        Object.entries(draft).filter(([, value]) => value.trim()),
      );
      const response = await fetch(`/api/studio/integrations/${row.provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        setMessage({ provider: row.provider, text: String(data.error || "Could not save that key."), ok: false });
        return;
      }
      // The only copy of the secret in this tab goes now.
      setDraft({});
      setEditing(null);
      setMessage({ provider: row.provider, text: data.replaced ? "Key replaced." : "Connected.", ok: true });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const test = async (row: ProviderRow) => {
    setBusy(row.provider);
    setMessage(null);
    try {
      const response = await fetch(`/api/studio/integrations/${row.provider}/test`, { method: "POST" });
      const data = await readJson(response);
      setMessage({
        provider: row.provider,
        text: response.ok ? "That key works." : String(data.error || "That key did not work."),
        ok: response.ok,
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (row: ProviderRow) => {
    setBusy(row.provider);
    setMessage(null);
    try {
      await fetch(`/api/studio/integrations/${row.provider}`, { method: "DELETE" });
      setMessage({ provider: row.provider, text: "Disconnected. Generations go back to studio credits.", ok: true });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading integrations…</p>;

  if (!configured) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1d1f1e] p-5 text-sm text-zinc-400">
        Your own provider keys are not enabled on this server yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-[#1d1f1e] p-5">
        <h3 className="t-title text-zinc-100">Use your own provider keys</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Connect a key and generations on that provider are billed to your own account by the
          provider, and cost no studio credits. Providers you have not connected keep using studio
          credits as before. Keys are encrypted and can never be read back — only replaced.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Create a key dedicated to this studio, and set a spending limit with your provider.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1d1f1e] p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={ownKeysOnly}
            onChange={async (event) => {
              const next = event.target.checked;
              setOwnKeysOnly(next);
              const response = await fetch("/api/studio/integrations", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ownKeysOnly: next }),
              });
              // Put the switch back if it did not save, rather than showing a
              // setting that is not in force.
              if (!response.ok) setOwnKeysOnly(!next);
            }}
            className="mt-1 h-4 w-4 accent-[#b9f42e]"
          />
          <span>
            <span className="block font-semibold text-zinc-100">Only ever use my own keys</span>
            <span className="mt-1 block text-sm leading-6 text-zinc-400">
              Never spend studio credits on my behalf. A provider I have not connected is
              refused instead of billed, so nothing runs unless one of my own accounts pays
              for it.
            </span>
          </span>
        </label>
      </div>

      {!vaultReadable && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-5 text-sm text-red-200">
          Connected keys could not be read just now, so every provider below shows as not
          connected. Nothing has been changed or disconnected — try again shortly.
        </div>
      )}

      {rows.map((row) => (
        <div key={row.provider} className="rounded-xl border border-white/10 bg-[#1d1f1e] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-zinc-100">{row.label}</p>
              {row.connected ? (
                <p className="mt-1 text-sm text-[#b9f42e]">
                  Connected{row.last4 ? ` · key ••••${row.last4}` : ""}
                  {row.status && row.status !== "active" ? ` · ${row.status}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">Not connected — using studio credits.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {row.connected && (
                <button
                  type="button"
                  disabled={busy === row.provider}
                  onClick={() => void test(row)}
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
                >
                  Test connection
                </button>
              )}
              <button
                type="button"
                disabled={busy === row.provider}
                onClick={() => { setEditing(editing === row.provider ? null : row.provider); setDraft({}); }}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
              >
                {row.connected ? "Replace key" : "Connect"}
              </button>
              {row.connected && (
                <button
                  type="button"
                  disabled={busy === row.provider}
                  onClick={() => void disconnect(row)}
                  className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-200 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {message?.provider === row.provider && (
            <p className={`mt-3 text-sm ${message.ok ? "text-[#b9f42e]" : "text-red-300"}`}>{message.text}</p>
          )}

          {editing === row.provider && (
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => { event.preventDefault(); void connect(row); }}
            >
              {row.parts.map((part) => (
                <label key={part.key} className="block">
                  <span className="t-caption text-zinc-400">
                    {part.label}{part.optional ? " (optional)" : ""}
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft[part.key] || ""}
                    onChange={(event) => setDraft((current) => ({ ...current, [part.key]: event.target.value }))}
                    className="mt-1 w-full rounded-lg bg-[#141614] px-3 py-2 font-mono text-sm text-zinc-200 outline-none"
                  />
                  {part.hint && <span className="mt-1 block text-xs text-zinc-500">{part.hint}</span>}
                </label>
              ))}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={busy === row.provider}
                  className="rounded-lg bg-[#b9f42e] px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  {busy === row.provider ? "Checking…" : "Save key"}
                </button>
                <a href={row.helpUrl} target="_blank" rel="noreferrer noopener" className="text-xs text-zinc-500 underline">
                  Where to find this
                </a>
              </div>
              <p className="text-xs text-zinc-500">
                The key is checked against {row.label} before it is saved, and encrypted once it is.
              </p>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
