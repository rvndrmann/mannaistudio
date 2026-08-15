"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CornerDownRight, Loader2, MessageSquare, Send } from "lucide-react";

/**
 * The revision thread on one shot.
 *
 * A delivered cut is discussed shot by shot — "this one is too dark", "can she
 * be looking left" — so the conversation lives on the shot rather than in a
 * project-wide inbox where nobody can tell which frame is being talked about.
 *
 * One level of replies. To the person typing there is only ever one
 * conversation, so a reply to a reply is folded back onto the note that opened
 * the thread instead of starting a tree nobody can read.
 */

export type ShotComment = {
  id: string;
  shot_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

type Author = { id: string; name: string };

function when(iso: string) {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return date.toLocaleDateString();
}

export function ShotComments({ projectId, shotId }: { projectId: string; shotId: string }) {
  const [comments, setComments] = useState<ShotComment[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/comments?shotId=${shotId}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load comments");
      setComments(json.comments || []);
      setAuthors(json.authors || {});
      setViewerId(json.viewerId || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load comments");
    } finally {
      setLoading(false);
    }
  }, [projectId, shotId]);

  useEffect(() => { void load(); }, [load]);

  const post = async (body: string, parentId?: string) => {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId, body: body.trim(), ...(parentId ? { parentId } : {}) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not post the comment");
      if (parentId) { setReplyDraft(""); setReplyTo(null); } else { setDraft(""); }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the comment");
    } finally {
      setBusy(false);
    }
  };

  const setResolved = async (commentId: string, resolved: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, resolved }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not update the comment");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the comment");
    } finally {
      setBusy(false);
    }
  };

  const threads = comments.filter((comment) => !comment.parent_id);
  const repliesOf = (id: string) => comments.filter((comment) => comment.parent_id === id);
  const openCount = threads.filter((thread) => !thread.resolved_at).length;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0c0b] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400">
          <MessageSquare className="h-3.5 w-3.5" />
          Revision notes
        </p>
        {openCount > 0 && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
            {openCount} open
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-500">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          No notes on this shot yet. Anyone on the project — you or the production team — can leave one here.
        </p>
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`rounded-lg border p-3 ${thread.resolved_at ? "border-white/[0.06] bg-white/[0.02] opacity-60" : "border-white/10 bg-white/[0.04]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-zinc-300">
                  {authors[thread.author_id]?.name || "Someone"}
                  {thread.author_id === viewerId && <span className="ml-1 font-normal text-zinc-500">(you)</span>}
                  <span className="ml-2 font-normal text-zinc-500">{when(thread.created_at)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setResolved(thread.id, !thread.resolved_at)}
                  disabled={busy}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold transition disabled:opacity-50 ${
                    thread.resolved_at
                      ? "border-white/15 text-zinc-400 hover:text-white"
                      : "border-[#b9f42e]/30 text-[#b9f42e] hover:bg-[#b9f42e]/10"
                  }`}
                >
                  <Check className="h-3 w-3" />
                  {thread.resolved_at ? "Reopen" : "Mark done"}
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200">{thread.body}</p>

              {repliesOf(thread.id).map((reply) => (
                <div key={reply.id} className="mt-2 flex gap-2 border-l border-white/10 pl-3">
                  <CornerDownRight className="mt-1 h-3 w-3 shrink-0 text-zinc-600" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-zinc-400">
                      {authors[reply.author_id]?.name || "Someone"}
                      {reply.author_id === viewerId && <span className="ml-1 font-normal text-zinc-500">(you)</span>}
                      <span className="ml-2 font-normal text-zinc-500">{when(reply.created_at)}</span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">{reply.body}</p>
                  </div>
                </div>
              ))}

              {replyTo === thread.id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void post(replyDraft, thread.id); } }}
                    placeholder="Reply…"
                    maxLength={5000}
                    className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[12px] text-zinc-200 outline-none focus:border-[#b9f42e]"
                  />
                  <button
                    type="button"
                    onClick={() => void post(replyDraft, thread.id)}
                    disabled={busy || !replyDraft.trim()}
                    className="rounded-lg bg-[#b9f42e] px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setReplyTo(thread.id); setReplyDraft(""); }}
                  className="mt-2 text-[11px] font-bold text-zinc-400 hover:text-white"
                >
                  Reply
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void post(draft); } }}
          placeholder="Leave a note on this shot…"
          maxLength={5000}
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-zinc-200 outline-none focus:border-[#b9f42e]"
        />
        <button
          type="button"
          onClick={() => void post(draft)}
          disabled={busy || !draft.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#b9f42e] px-3 py-2 text-[11px] font-bold text-black transition hover:bg-[#a8e024] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send
        </button>
      </div>

      {error && <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
