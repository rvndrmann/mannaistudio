"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Connect, test, replace and delete provider keys.
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
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [paused, setPaused] = useState<string | null>(null);
  const [vaultReadable, setVaultReadable] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ provider: string; text: string; ok: boolean } | null>(null);
  // Deleting a key stops that provider working at once, so it takes a second
  // press on the same card rather than one stray click.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/studio/integrations", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(String(data.error || "Could not load API key settings. Please try again."));
      setLoadError(null);
      setRows((data.providers as ProviderRow[]) || []);
      setConfigured(Boolean(data.configured));
      setSubscriptionRequired(Boolean(data.subscriptionRequired));
      setPaused(data.paused ? String(data.pausedMessage || "This is paused right now.") : null);
      setVaultReadable(data.vaultReadable !== false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load API key settings.");
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

  const deleteKey = async (row: ProviderRow) => {
    setBusy(row.provider);
    setMessage(null);
    try {
      const response = await fetch(`/api/studio/integrations/${row.provider}`, { method: "DELETE" });
      const data = await readJson(response);
      setMessage(response.ok
        ? { provider: row.provider, text: `Key deleted from this studio. ${row.label} requests are blocked until you add a new one.`, ok: true }
        : { provider: row.provider, text: String(data.error || "That key could not be deleted. Please try again."), ok: false });
      setConfirmingDelete(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading integrations…</p>;

  if (loadError) return <div className="rounded-xl border border-primary/30 bg-primary/[.06] p-5 text-sm text-zinc-300"><h3 className="font-semibold text-white">Subscribe and connect your API keys</h3><p className="mt-2">{loadError}</p><Link href="/billing" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-black">View subscriptions</Link></div>;

  // Checked before everything else: while it is paused, whether this account
  // could otherwise subscribe or connect is not the useful thing to say.
  if (paused) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[.06] p-5 text-sm text-zinc-300">
        <h3 className="font-semibold text-white">Paused for now</h3>
        <p className="mt-2 leading-6 text-zinc-400">{paused}</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1d1f1e] p-5 text-sm text-zinc-400">
        Your own provider keys are not enabled on this server yet.
      </div>
    );
  }

  if (subscriptionRequired) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/[.06] p-5 text-sm text-zinc-300">
        <h3 className="font-semibold text-white">Bring your own API keys is for subscribers.</h3>
        <p className="mt-2 leading-6 text-zinc-400">Subscribe to use your OpenAI, Google, BytePlus, or fal.ai keys at provider rates.</p>
        <Link href="/billing" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 font-semibold text-black">View subscriptions</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-[#1d1f1e] p-5">
        <h3 className="t-title text-zinc-100">Use your own provider keys</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Connect a key for each provider you use. Chat and generations are billed directly
          to your provider account. Missing keys block requests. Keys are encrypted and can
          never be read back — only replaced.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Create a key dedicated to this studio, and set a spending limit with your provider.
        </p>
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
                <p className="mt-1 text-sm text-primary">
                  Connected{row.last4 ? ` · key ••••${row.last4}` : ""}
                  {row.status && row.status !== "active" ? ` · ${row.status}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">Not connected — add a key to use {row.label}.</p>
              )}
              <a href={row.helpUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
                Where to find your {row.label} key ↗
              </a>
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
                onClick={() => { setEditing(editing === row.provider ? null : row.provider); setDraft({}); setConfirmingDelete(null); }}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
              >
                {row.connected ? "Replace key" : "Connect"}
              </button>
              {row.connected && (
                <button
                  type="button"
                  disabled={busy === row.provider}
                  onClick={() => { setConfirmingDelete(confirmingDelete === row.provider ? null : row.provider); setEditing(null); setMessage(null); }}
                  className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-200 disabled:opacity-50"
                >
                  Delete key
                </button>
              )}
            </div>
          </div>

          {confirmingDelete === row.provider && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-400/30 bg-red-500/5 px-3 py-2.5">
              <p className="min-w-0 flex-1 text-sm text-red-100">
                Delete your {row.label} key{row.last4 ? ` ••••${row.last4}` : ""} from this studio? It cannot be recovered here, and {row.label} requests stop until you add a new one.
              </p>
              <button
                type="button"
                disabled={busy === row.provider}
                onClick={() => void deleteKey(row)}
                className="rounded-lg bg-red-500/90 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === row.provider ? "Deleting…" : "Yes, delete it"}
              </button>
              <button
                type="button"
                disabled={busy === row.provider}
                onClick={() => setConfirmingDelete(null)}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 disabled:opacity-50"
              >
                Keep it
              </button>
            </div>
          )}

          {message?.provider === row.provider && (
            <p className={`mt-3 text-sm ${message.ok ? "text-primary" : "text-red-300"}`}>{message.text}</p>
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
              <button
                type="submit"
                disabled={busy === row.provider}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
              >
                {busy === row.provider ? "Checking…" : "Save key"}
              </button>
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
