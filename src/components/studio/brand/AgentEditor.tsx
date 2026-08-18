"use client";

import { useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import type { BrandAgentView } from "./types";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

/**
 * Adds a custom agent, or rewrites one of the built-in briefs.
 *
 * Editing a built-in saves a row under the same key, so the brand gets one
 * edited Script Writer rather than a second one competing with the original.
 * Deleting that row restores the shipped brief, which is what "reset" does.
 */
export default function AgentEditor({
  brandId,
  agent,
  onClose,
  onSaved,
}: {
  brandId: string;
  agent: BrandAgentView | null;
  onClose: () => void;
  onSaved: (agents: BrandAgentView[]) => void;
}) {
  const editing = Boolean(agent);
  const [draft, setDraft] = useState<BrandAgentView>(
    agent || {
      agent_key: "",
      name: "",
      role_summary: "",
      instructions: "",
      writes_script: true,
      enabled: true,
      builtin: false,
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const agentKey = draft.agent_key || slugify(draft.name);
    if (!draft.name.trim() || !agentKey) {
      setError("Give the agent a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_key: agentKey,
          name: draft.name.trim(),
          role_summary: draft.role_summary,
          instructions: draft.instructions,
          writes_script: draft.writes_script,
          enabled: draft.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the agent.");
      onSaved(data.agents);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the agent.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/agents/${draft.agent_key}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove the agent.");
      onSaved(data.agents);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the agent.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-2xl border border-white/10 bg-[#101110] p-5"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold">{editing ? `Edit ${draft.name}` : "New agent"}</h2>
          <button onClick={onClose} className="ml-auto rounded p-1 text-zinc-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-[12px] leading-5 text-zinc-500">
          {draft.builtin
            ? "This is a built-in agent. Saving keeps your brief; resetting restores the one that ships with the studio."
            : "Your own specialist. It reads the same brand record, knowledge base, and asset library as the built-in agents."}
        </p>

        <label className="mt-4 block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">NAME</span>
          <input
            value={draft.name}
            disabled={draft.builtin}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Hook Doctor"
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#b9f42e]/40 disabled:opacity-60"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">WHAT IT DOES</span>
          <input
            value={draft.role_summary}
            onChange={(event) => setDraft({ ...draft, role_summary: event.target.value })}
            placeholder="Rewrites the first three seconds until they stop the scroll."
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-[11px] font-bold tracking-[.14em] text-zinc-500">INSTRUCTIONS</span>
          <textarea
            value={draft.instructions}
            rows={12}
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            placeholder="Write the brief the way you would brief a freelancer: what it owns, how it works, what it must never do."
            className="mt-1.5 w-full resize-y rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[13px] leading-6 outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40"
          />
        </label>

        <label className="mt-3 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={draft.writes_script}
            onChange={(event) => setDraft({ ...draft, writes_script: event.target.checked })}
            className="h-4 w-4 accent-[#b9f42e]"
          />
          <span className="text-[12px] text-zinc-300">
            This agent writes scripts — its scripts can be saved and sent to production.
          </span>
        </label>

        <label className="mt-2 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            className="h-4 w-4 accent-[#b9f42e]"
          />
          <span className="text-[12px] text-zinc-300">Available in the chat</span>
        </label>

        {error && <p className="mt-3 text-[12px] font-semibold text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-4 py-2.5 text-[13px] font-bold text-black disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save agent
          </button>
          {editing && (
            <button
              onClick={reset}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-4 py-2.5 text-[13px] font-semibold text-zinc-300 hover:border-red-500/40 hover:text-red-400"
            >
              <RotateCcw className="h-4 w-4" />
              {draft.builtin ? "Reset to default" : "Delete agent"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
