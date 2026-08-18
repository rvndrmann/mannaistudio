"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, FileText, Loader2, Save, Send, Trash2 } from "lucide-react";
import type { BrandScriptView } from "./types";

type ProjectOption = { id: string; name: string };

export default function BrandScripts({
  brandId,
  scripts,
  canEdit,
  onChange,
}: {
  brandId: string;
  scripts: BrandScriptView[];
  canEdit: boolean;
  onChange: (scripts: BrandScriptView[]) => void;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "", overview: "" });
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [target, setTarget] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/studio/projects");
        if (!res.ok) return;
        const data = await res.json();
        setProjects(Array.isArray(data) ? data.map((project: ProjectOption) => ({ id: project.id, name: project.name })) : []);
      } catch {
        // The handoff still works without this list; it only offers "new production".
      }
    })();
  }, []);

  const open = (script: BrandScriptView) => {
    setOpenId(script.id);
    setDraft({ title: script.title, body: script.content?.body || "", overview: script.content?.overview || "" });
    setError("");
  };

  const save = async (script: BrandScriptView, status?: "draft" | "final") => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title || script.title,
          ...(status ? { status } : {}),
          content: { title: draft.title || script.title, overview: draft.overview, body: draft.body },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the script.");
      onChange(scripts.map((item) => (item.id === script.id ? data.script : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the script.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (script: BrandScriptView) => {
    onChange(scripts.filter((item) => item.id !== script.id));
    if (openId === script.id) setOpenId(null);
    await fetch(`/api/studio/brands/${brandId}/scripts/${script.id}`, { method: "DELETE" });
  };

  const sendToProduction = async (script: BrandScriptView) => {
    setSendingId(script.id);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/scripts/${script.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target ? { projectId: target } : { projectName: script.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the script to production.");
      onChange(scripts.map((item) => (item.id === script.id ? data.script : item)));
      router.push(`/studio/project/${data.projectId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the script to production.");
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-[12px] leading-5 text-zinc-500">
        Scripts your agents wrote. Send one to production and it lands as the project&apos;s saved script, with this brand&apos;s assets imported —
        the AI Director then builds the characters, assets, and storyboard from there.
      </p>

      {error && <p className="text-[12px] font-semibold text-red-400">{error}</p>}

      {scripts.length === 0 ? (
        <p className="text-[12px] text-zinc-600">Nothing saved yet. Ask the Script Writer for a script, then save it from the chat.</p>
      ) : (
        <div className="space-y-2">
          {scripts.map((script) => {
            const isOpen = openId === script.id;
            return (
              <article key={script.id} className="rounded-xl border border-white/[0.06] bg-[#111211]">
                <button onClick={() => (isOpen ? setOpenId(null) : open(script))} className="flex w-full items-center gap-2 p-3 text-left">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-zinc-100">{script.title}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      script.status === "final" ? "bg-[#b9f42e]/15 text-[#b9f42e]" : "bg-[#1a1a1a] text-zinc-400"
                    }`}
                  >
                    {script.status}
                  </span>
                </button>

                {script.sent_project_id && (
                  <p className="px-3 pb-2 text-[11px] text-zinc-500">
                    Sent to production ·{" "}
                    <button
                      onClick={() => router.push(`/studio/project/${script.sent_project_id}`)}
                      className="font-bold text-[#b9f42e] hover:underline"
                    >
                      open the project
                    </button>
                  </p>
                )}

                {isOpen && (
                  <div className="space-y-2 border-t border-white/[0.06] p-3">
                    <input
                      value={draft.title}
                      disabled={!canEdit}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      className="w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[13px] font-bold outline-none disabled:opacity-70"
                    />
                    <textarea
                      value={draft.overview}
                      disabled={!canEdit}
                      rows={2}
                      onChange={(event) => setDraft({ ...draft, overview: event.target.value })}
                      placeholder="One-line intent for this script."
                      className="w-full resize-y rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] leading-6 outline-none placeholder:text-zinc-600 disabled:opacity-70"
                    />
                    <textarea
                      value={draft.body}
                      disabled={!canEdit}
                      rows={14}
                      onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                      className="w-full resize-y rounded-lg bg-[#1a1a1a] p-3 font-mono text-[12px] leading-6 text-zinc-200 outline-none disabled:opacity-70"
                    />

                    {canEdit && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => save(script)}
                            disabled={saving}
                            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] font-bold text-zinc-200 hover:border-[#b9f42e]/40 disabled:opacity-60"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save draft
                          </button>
                          <button
                            onClick={() => save(script, "final")}
                            disabled={saving}
                            className="rounded-lg bg-[#b9f42e] px-3 py-2 text-[12px] font-bold text-black disabled:opacity-60"
                          >
                            Mark final
                          </button>
                          <button
                            onClick={() => remove(script)}
                            className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] font-semibold text-zinc-400 hover:border-red-500/40 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>

                        <div className="space-y-2 rounded-lg border border-[#b9f42e]/25 bg-[#b9f42e]/[0.04] p-3">
                          <p className="text-[11px] font-bold tracking-[.14em] text-[#b9f42e]">SEND TO PRODUCTION</p>
                          <select
                            value={target}
                            onChange={(event) => setTarget(event.target.value)}
                            className="w-full rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] outline-none"
                          >
                            <option value="">Start a new production</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => sendToProduction(script)}
                            disabled={sendingId === script.id}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 py-2.5 text-[12px] font-bold text-black disabled:opacity-60"
                          >
                            {sendingId === script.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                            Send script &amp; hand to the AI Director
                          </button>
                          <p className="text-[11px] leading-5 text-zinc-500">
                            <Send className="mr-1 inline h-3 w-3" />
                            Saves it as the project script, imports this brand&apos;s assets as project characters and props, and opens the
                            production.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
