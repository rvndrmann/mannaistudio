"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, FileDown, ImagePlus, Loader2, Send, X } from "lucide-react";
import BrandImage from "./BrandImage";
import type { BrandAgentView, BrandAssetView, BrandAttachment, BrandChatView, BrandKnowledgeView, BrandMessageView, BrandScriptView, BrandView } from "./types";

const scriptBlock = /```script\s*\r?\n([\s\S]*?)```/i;

/** The same block the agents are told to deliver scripts in, shown as a script. */
function splitReply(content: string): { prose: string; script: string | null } {
  const match = scriptBlock.exec(content);
  if (!match) return { prose: content, script: null };
  return { prose: content.replace(match[0], "").trim(), script: match[1].trim() };
}

export default function BrandChat({
  brandId,
  chat,
  agents,
  onChatUpdated,
  onScriptSaved,
  onBrandLearned,
}: {
  brandId: string;
  chat: BrandChatView | null;
  agents: BrandAgentView[];
  onChatUpdated: (chat: BrandChatView) => void;
  onScriptSaved: (script: BrandScriptView) => void;
  onBrandLearned: (update: { brand?: BrandView; knowledge?: BrandKnowledgeView[]; assets?: BrandAssetView[] }) => void;
}) {
  // Kept beside the chat it belongs to, so switching chats shows an empty
  // thread while the new one loads rather than the previous chat's messages.
  const [thread, setThread] = useState<{ chatId: string; messages: BrandMessageView[] }>({ chatId: "", messages: [] });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<BrandAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [savingScriptFor, setSavingScriptFor] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const chatId = chat?.id || "";
  const agentKey = chat?.agent_key || agents[0]?.agent_key || "content_strategist";
  const agent = agents.find((item) => item.agent_key === agentKey);
  const messages = thread.chatId === chatId ? thread.messages : [];

  useEffect(() => {
    if (!chatId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/studio/brands/${brandId}/chats/${chatId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load the chat.");
        if (active) setThread({ chatId, messages: data.messages || [] });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load the chat.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [brandId, chatId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const added: BrandAttachment[] = [];
      for (const file of Array.from(files).slice(0, 4)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/studio/brands/${brandId}/uploads`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not upload the image.");
        added.push({ path: data.path, url: "", name: file.name, kind: "image" });
      }
      setAttachments((current) => [...current, ...added].slice(0, 8));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the image.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const send = async () => {
    if (!chat || !message.trim() || sending) return;
    const outgoing = message.trim();
    const outgoingAttachments = attachments;
    setMessage("");
    setAttachments([]);
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: outgoing, agentKey, attachments: outgoingAttachments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The agent could not answer.");
      setThread((current) => ({ chatId: chat.id, messages: [...(current.chatId === chat.id ? current.messages : []), data.userMessage, data.assistantMessage] }));
      if (data.chat) onChatUpdated({ ...chat, title: data.chat.title, agent_key: data.chat.agent_key, updated_at: new Date().toISOString() });
      // The agent records what it learns as it goes, so the panel beside the
      // chat has to re-render now rather than on the next reload.
      if (data.brand || data.savedKnowledge?.length || data.savedAssets?.length) {
        onBrandLearned({ brand: data.brand, knowledge: data.savedKnowledge, assets: data.savedAssets });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent could not answer.");
      // The message is handed back rather than lost, so a failed turn can be
      // retried without retyping it.
      setMessage(outgoing);
      setAttachments(outgoingAttachments);
    } finally {
      setSending(false);
    }
  };

  const saveScript = async (messageId: string, script: string) => {
    if (!chat) return;
    setSavingScriptFor(messageId);
    setError("");
    try {
      const firstLine = script.split("\n")[0] || "";
      const titled = /^title\s*[:\-—]\s*(.+)$/i.exec(firstLine.trim());
      const title = titled ? titled[1].trim() : chat.title;
      const body = titled ? script.split("\n").slice(1).join("\n").trim() : script;
      const res = await fetch(`/api/studio/brands/${brandId}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.slice(0, 240), status: "draft", chat_id: chat.id, content: { title, body } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the script.");
      onScriptSaved(data.script);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the script.");
    } finally {
      setSavingScriptFor(null);
    }
  };

  if (!chat) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-sm font-bold text-zinc-300">No chat open</p>
          <p className="mt-1.5 max-w-sm text-[12px] leading-5 text-zinc-500">
            Pick an agent and start a chat. Everything it knows about your brand is already loaded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-zinc-100">{chat.title}</p>
          <p className="truncate text-[11px] text-zinc-500">{agent?.name || agentKey}</p>
        </div>
        <select
          value={agentKey}
          onChange={async (event) => {
            const nextKey = event.target.value;
            onChatUpdated({ ...chat, agent_key: nextKey });
            await fetch(`/api/studio/brands/${brandId}/chats/${chat.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentKey: nextKey }),
            });
          }}
          className="ml-auto max-w-[45%] shrink-0 rounded-full border border-white/[0.08] bg-[#141414] px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 outline-none hover:border-[#b9f42e]/40"
        >
          {agents.map((option) => (
            <option key={option.agent_key} value={option.agent_key}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-3 py-4">
        {loading ? (
          <div className="grid place-items-center py-10 text-zinc-600">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="mx-auto max-w-md py-10 text-center text-[12px] leading-6 text-zinc-500">
            {agent?.role_summary || "Ask for what you need."}
          </p>
        ) : (
          messages.map((item) => {
            const { prose, script } = item.role === "assistant" ? splitReply(item.content) : { prose: item.content, script: null };
            const speaker = agents.find((option) => option.agent_key === item.agent_key);
            // A handover changes who is talking mid-thread, so an assistant
            // bubble has to say which agent wrote it.
            const handovers = (item.tool_notes || []).filter((note) => note.includes("handed this to"));
            const savedNotes = (item.tool_notes || []).filter((note) => !note.includes("handed this to"));
            return (
              <div key={item.id} className={`mb-3 max-w-[92%] ${item.role === "user" ? "ml-auto" : ""}`}>
                {handovers.map((note, index) => (
                  <p
                    key={`${item.id}-handover-${index}`}
                    className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#b9f42e]"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
                    {note}
                  </p>
                ))}
                {item.role === "assistant" && speaker && (
                  <p className="mb-1 text-[11px] font-bold text-zinc-500">{speaker.name}</p>
                )}
                <div
                  className={`whitespace-pre-wrap rounded-xl p-3 text-[13px] leading-6 ${
                    item.role === "user" ? "bg-[#b9f42e] text-black" : "bg-[#181918] text-zinc-200"
                  }`}
                >
                  {prose || (script ? "Script below." : "")}
                </div>

                {savedNotes.map((note, index) => (
                  <p key={`${item.id}-note-${index}`} className="mt-1.5 text-[11px] text-zinc-500">
                    {note}
                  </p>
                ))}

                {item.attachments?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {item.attachments.map((attachment, index) => (
                      <BrandImage
                        key={`${item.id}-${index}`}
                        path={attachment.path}
                        url={attachment.url}
                        alt={attachment.name || "attachment"}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}

                {script && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.04]">
                    <p className="border-b border-[#b9f42e]/20 px-3 py-2 text-[11px] font-bold tracking-[.14em] text-[#b9f42e]">SCRIPT</p>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 font-mono text-[12px] leading-6 text-zinc-200">{script}</pre>
                    <button
                      onClick={() => saveScript(item.id, script)}
                      disabled={savingScriptFor === item.id}
                      className="flex w-full items-center justify-center gap-1.5 border-t border-[#b9f42e]/20 bg-[#b9f42e]/10 px-3 py-2.5 text-[12px] font-bold text-[#b9f42e] hover:bg-[#b9f42e]/20 disabled:opacity-60"
                    >
                      {savingScriptFor === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                      Save as draft script
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        {sending && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#181918] p-3 text-[12px] text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {agent?.name || "The agent"} is working…
          </div>
        )}
      </div>

      {error && <p className="shrink-0 px-3 pb-2 text-[12px] font-semibold text-red-400">{error}</p>}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="shrink-0 border-t border-white/[0.06] bg-[#101110] p-3"
      >
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment, index) => (
              <span key={attachment.path} className="relative">
                <BrandImage path={attachment.path} alt={attachment.name} className="h-14 w-14 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((_, position) => position !== index))}
                  className="absolute -right-1 -top-1 rounded-full bg-black p-0.5 text-zinc-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            title="Attach a product or character image"
            className="shrink-0 rounded-lg border border-white/[0.08] bg-[#141414] p-2.5 text-zinc-300 hover:border-[#b9f42e]/40 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => attach(event.target.files)} />
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={`Ask ${agent?.name || "the agent"}…`}
            className="min-h-[44px] w-full resize-y rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2.5 text-[13px] leading-6 outline-none placeholder:text-zinc-600 focus:border-[#b9f42e]/40"
          />
          <button
            type="submit"
            disabled={sending || !message.trim()}
            aria-label="Send"
            className="shrink-0 rounded-lg bg-[#b9f42e] p-2.5 text-black disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
