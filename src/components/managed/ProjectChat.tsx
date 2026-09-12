"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, Loader2, Send } from "lucide-react"
import { AttachmentPicker } from "@/components/managed/BriefFields"
import MediaThumb, { useSignedMedia } from "@/components/managed/MediaThumb"
import type { ManagedAttachment } from "@/lib/managed-brief"
import type { ManagedDeliverable, ManagedMessage } from "@/components/managed/types"

/**
 * The project conversation.
 *
 * One thread per project, shared by the client and the producing team, so that
 * nobody has to move to email or WhatsApp to ask a question — the whole reason
 * a managed service feels like an agency rather than a form is that there is
 * somewhere to say "can the hook be shorter?" and be answered.
 *
 * Polled rather than subscribed. Realtime would mean a second connection and a
 * second set of failure modes for a conversation that moves a few times a day;
 * the notification bell already polls on the same cadence.
 */
export default function ProjectChat({
  projectId, messages, deliverables, viewerId, onSent,
}: {
  projectId: string
  messages: ManagedMessage[]
  deliverables: ManagedDeliverable[]
  viewerId: string
  onSent: () => void
}) {
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<ManagedAttachment[]>([])
  const [about, setAbout] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  const send = async () => {
    if (!body.trim() && !attachments.length) return
    setSending(true)
    setError("")
    try {
      const res = await fetch(`/api/managed/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, attachments, deliverableId: about || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not send that message.")
      setBody("")
      setAttachments([])
      onSent()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send that message.")
    } finally {
      setSending(false)
    }
  }

  const titleFor = (deliverableId: string | null) =>
    deliverables.find((deliverable) => deliverable.id === deliverableId)?.title || ""

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="shrink-0 border-b border-white/[0.08] px-5 py-3.5">
        <h2 className="text-sm font-bold">Project chat</h2>
        <p className="text-[11px] text-white/35">You and the creative team. Files welcome.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-xs text-white/30">
            No messages yet. Say hello, or ask us anything about your brief.
          </p>
        )}
        {messages.map((message) => {
          const mine = message.sender_id === viewerId
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  mine
                    ? "bg-primary/15 text-white"
                    : message.kind === "delivery"
                      ? "border border-primary/25 bg-primary/[0.07] text-white"
                      : "bg-white/[0.06] text-white/85"
                }`}
              >
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/35">
                  {mine ? "You" : message.sender_is_admin ? "AI Director Hub team" : "Client"}
                  {message.deliverable_id && titleFor(message.deliverable_id)
                    ? ` · ${titleFor(message.deliverable_id)}`
                    : ""}
                </p>
                {message.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>}
                {message.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <Attachment key={attachment.path} attachment={attachment} />
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-white/25">
                  {new Date(message.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 space-y-2 border-t border-white/[0.08] p-3">
        {error && <p className="text-xs text-red-300">{error}</p>}
        {deliverables.length > 1 && (
          <select
            value={about}
            onChange={(event) => setAbout(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 focus:border-primary focus:outline-none"
          >
            <option value="">About the project</option>
            {deliverables.map((deliverable) => (
              <option key={deliverable.id} value={deliverable.id}>About {deliverable.title}</option>
            ))}
          </select>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send() }
            }}
            placeholder="Write a message…"
            rows={2}
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || (!body.trim() && !attachments.length)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-black transition active:scale-95 disabled:opacity-40"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <AttachmentPicker
          kind="attachment"
          label="Attach"
          accept="image/*,video/*,application/pdf,.doc,.docx,.txt"
          value={attachments}
          onChange={setAttachments}
          projectId={projectId}
        />
      </div>
    </div>
  )
}

function Attachment({ attachment }: { attachment: ManagedAttachment }) {
  const url = useSignedMedia(attachment.path)
  const visual = attachment.contentType.startsWith("image/") || attachment.contentType.startsWith("video/")

  if (visual) {
    return (
      <a href={url || "#"} target="_blank" rel="noreferrer" className="block h-20 w-28 overflow-hidden rounded-lg border border-white/10">
        <MediaThumb path={attachment.path} alt={attachment.name} className="h-full w-full object-cover" />
      </a>
    )
  }

  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noreferrer"
      className="flex max-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white/65 transition hover:bg-white/10"
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{attachment.name || "Attachment"}</span>
    </a>
  )
}
