"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Pin, Plus, Trash2 } from "lucide-react";
import type { BrandKnowledgeView } from "./types";

const kinds = ["note", "link", "product", "service", "audience", "guideline", "faq", "competitor"];

export default function BrandKnowledge({
  brandId,
  entries,
  canEdit,
  onChange,
}: {
  brandId: string;
  entries: BrandKnowledgeView[];
  canEdit: boolean;
  onChange: (entries: BrandKnowledgeView[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ kind: "note", title: "", content: "", url: "", pinned: false });

  const add = async () => {
    if (!draft.title.trim()) {
      setError("Give the entry a title.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the entry.");
      onChange([data.entry, ...entries]);
      setDraft({ kind: "note", title: "", content: "", url: "", pinned: false });
      setAdding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (entry: BrandKnowledgeView) => {
    const next = entries.map((item) => (item.id === entry.id ? { ...item, pinned: !item.pinned } : item));
    onChange(next);
    await fetch(`/api/studio/brands/${brandId}/knowledge/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !entry.pinned }),
    });
  };

  const remove = async (entry: BrandKnowledgeView) => {
    onChange(entries.filter((item) => item.id !== entry.id));
    await fetch(`/api/studio/brands/${brandId}/knowledge/${entry.id}`, { method: "DELETE" });
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-[12px] leading-5 text-zinc-500">
        Everything here is read by every agent on this brand. Paste research, product facts, tone examples, past winners — anything you would
        otherwise re-explain each time.
      </p>

      {canEdit && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] font-bold text-zinc-200 hover:border-[#b9f42e]/40"
        >
          <Plus className="h-4 w-4" /> Add to knowledge base
        </button>
      )}

      {adding && (
        <div className="space-y-2 rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.04] p-3">
          <div className="flex gap-2">
            <select
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
              className="rounded-lg border border-white/[0.08] bg-[#141414] px-2.5 py-2 text-[12px] outline-none"
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="Title"
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[13px] outline-none placeholder:text-zinc-600"
            />
          </div>
          <textarea
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            rows={4}
            placeholder="The detail itself."
            className="w-full resize-y rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[13px] leading-6 outline-none placeholder:text-zinc-600"
          />
          <input
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            placeholder="Link (optional)"
            className="w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] outline-none placeholder:text-zinc-600"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 py-2 text-[12px] font-bold text-black disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save entry
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError("");
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-[12px] font-semibold text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[12px] font-semibold text-red-400">{error}</p>}

      {entries.length === 0 ? (
        <p className="text-[12px] text-zinc-600">Nothing saved yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-white/[0.06] bg-[#111211] p-3">
              <div className="flex items-start gap-2">
                <span className="rounded-full border border-white/[0.08] bg-[#141414] px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                  {entry.kind}
                </span>
                <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-zinc-100">{entry.title}</p>
                {canEdit && (
                  <>
                    <button
                      onClick={() => togglePin(entry)}
                      title={entry.pinned ? "Unpin" : "Pin so agents always see it"}
                      className={`shrink-0 rounded p-1 ${entry.pinned ? "text-[#b9f42e]" : "text-zinc-600 hover:text-zinc-300"}`}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(entry)} className="shrink-0 rounded p-1 text-zinc-600 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
              {entry.content && <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-zinc-400">{entry.content}</p>}
              {entry.url && (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-[#b9f42e] hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {entry.url}
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
