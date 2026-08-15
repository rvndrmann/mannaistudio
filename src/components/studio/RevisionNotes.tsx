"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Check, ChevronRight, CornerDownRight, Loader2, Lock, MessageSquare, Send } from "lucide-react";

/**
 * The revision thread the client and the producing team share.
 *
 * Three targets, because a client reviewing a delivered cut has three kinds of
 * note: this frame is too dark, this character's face keeps changing, and the
 * whole thing runs long. Only the first used to have anywhere to live, so the
 * other two were written on whichever shot happened to be open — which is where
 * nobody looks for them afterwards.
 *
 * Replies are one level deep. To the person typing there is only ever one
 * conversation, so a reply to a reply folds back onto the note that opened it
 * rather than starting a tree nobody can read.
 *
 * On a project nobody has hired the team for, the panel is a description of the
 * service rather than a conversation with nobody on the other end. It is still
 * shown rather than hidden: a client who does not know the service exists cannot
 * ask for it.
 */

export type RevisionTarget =
  // A shot has two threads. The keyframe is frequently exactly right and the
  // clip made from it is not — framing lands, motion drifts — and merging them
  // makes the client write "the image is fine but the video is bad" every time.
  | { type: "shot"; id: string; track: "image" | "video" }
  | { type: "entity"; id: string }
  | { type: "project" };

type Note = {
  id: string;
  shot_id: string | null;
  entity_id: string | null;
  track: "image" | "video" | null;
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

function queryFor(target: RevisionTarget) {
  if (target.type === "shot") return `shotId=${target.id}&track=${target.track}`;
  if (target.type === "entity") return `entityId=${target.id}`;
  return "scope=project";
}

function bodyFor(target: RevisionTarget) {
  if (target.type === "shot") return { shotId: target.id, track: target.track };
  if (target.type === "entity") return { entityId: target.id };
  return {};
}

function placeholderFor(target: RevisionTarget) {
  if (target.type === "shot") return target.track === "video" ? "What should change in this clip?" : "What should change in this frame?";
  if (target.type === "entity") return "Leave a note on this asset…";
  return "Leave a note on the whole project…";
}

function emptyFor(target: RevisionTarget) {
  if (target.type === "shot") {
    return target.track === "video"
      ? "No notes on this clip yet. Motion, timing, performance — anything about how it moves."
      : "No notes on this frame yet. Framing, lighting, likeness — anything about how it looks.";
  }
  if (target.type === "entity") return "No notes on this asset yet.";
  return "No notes on the project yet. Use this for anything that is not about one shot — pacing, music, the cut as a whole.";
}

export function RevisionNotes({
  projectId,
  target,
  title = "Revision notes",
  /** Opens the hire dialog from the locked state, when the host can show one. */
  onHireTeam,
  defaultOpen = true,
}: {
  projectId: string;
  target: RevisionTarget;
  title?: string;
  onHireTeam?: () => void;
  defaultOpen?: boolean;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [notesActive, setNotesActive] = useState(false);
  const [enterpriseStatus, setEnterpriseStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState<string | null>(null);

  const query = queryFor(target);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/comments?${query}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load revision notes");
      setNotes(json.comments || []);
      setAuthors(json.authors || {});
      setViewerId(json.viewerId || null);
      setNotesActive(Boolean(json.notesActive));
      setEnterpriseStatus(json.enterpriseStatus ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load revision notes");
    } finally {
      setLoading(false);
    }
  }, [projectId, query]);

  useEffect(() => { void load(); }, [load]);

  const post = async (body: string, parentId?: string) => {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bodyFor(target), body: body.trim(), ...(parentId ? { parentId } : {}) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not post the note");
      if (parentId) { setReplyDraft(""); setReplyTo(null); } else { setDraft(""); }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the note");
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
      if (!response.ok) throw new Error(json.error || "Could not update the note");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the note");
    } finally {
      setBusy(false);
    }
  };

  const threads = notes.filter((note) => !note.parent_id);
  const repliesOf = (id: string) => notes.filter((note) => note.parent_id === id);
  const openCount = threads.filter((thread) => !thread.resolved_at).length;

  // Not hired: the panel explains what this is for instead of offering an input
  // that would be rejected by the server the moment it was used.
  if (!loading && !notesActive) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0b0c0b] p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-500">
          <Lock className="h-3.5 w-3.5" />
          {title} · Enterprise
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          {enterpriseStatus === "requested"
            ? "Your request is with our team. Notes open here as soon as we accept it, and you can ask for changes on any shot, asset, or the cut as a whole."
            : "When our production team takes on your project, this is where you ask for changes — on any shot, any asset, or the whole cut — and we answer you here."}
        </p>
        {onHireTeam && enterpriseStatus !== "requested" && (
          <button
            type="button"
            onClick={onHireTeam}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#b9f42e]/30 bg-[#b9f42e]/[0.07] px-3 py-1.5 text-[11px] font-bold text-[#b9f42e] transition hover:bg-[#b9f42e]/15"
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            Hire our team
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0c0b] p-4">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400">
          <MessageSquare className="h-3.5 w-3.5" />
          {title}
        </span>
        <span className="flex items-center gap-2">
          {openCount > 0 && (
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">{openCount} open</span>
          )}
          <ChevronRight className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        </span>
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <p className="text-[11px] text-zinc-500">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-zinc-500">{emptyFor(target)}</p>
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
                        thread.resolved_at ? "border-white/15 text-zinc-400 hover:text-white" : "border-[#b9f42e]/30 text-[#b9f42e] hover:bg-[#b9f42e]/10"
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
              placeholder={placeholderFor(target)}
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
      )}
    </div>
  );
}
