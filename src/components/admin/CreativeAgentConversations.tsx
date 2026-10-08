"use client"

import { useEffect, useState } from "react"
import { Bot, MessageSquare, Pause, Play, Send } from "lucide-react"

type Message = { id: string; sender: "visitor" | "agent" | "admin" | "system"; body: string; created_at: string }
type Conversation = { id: string; visitor_id: string; user_id: string | null; agent_paused: boolean; updated_at: string; creative_agent_messages: Message[] }

export default function CreativeAgentConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [reply, setReply] = useState("")
  const [loading, setLoading] = useState(true)

  async function load() {
    const response = await fetch("/api/admin/creative-agent/conversations", { cache: "no-store" })
    const data = response.ok ? await response.json() : { conversations: [] }
    setConversations(data.conversations ?? [])
    setSelected((current) => data.conversations?.find((item: Conversation) => item.id === current?.id) ?? current)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function update(action: "pause" | "resume" | "message") {
    if (!selected || (action === "message" && !reply.trim())) return
    const response = await fetch(`/api/admin/creative-agent/conversations/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, body: action === "message" ? reply : undefined }) })
    if (response.ok) { setReply(""); await load() }
  }

  return <div className="space-y-5">
    <header><h1 className="text-3xl font-bold tracking-tight">Creative Agent conversations</h1><p className="mt-2 text-sm text-white/45">Every visitor thread is retained, including anonymous conversations. Pause automated acknowledgements to take over a thread manually.</p></header>
    <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-white/[.025] lg:grid-cols-[320px_1fr]">
      <div className="border-b border-white/10 lg:border-b-0 lg:border-r">
        {loading && <p className="p-5 text-sm text-white/45">Loading conversations…</p>}
        {!loading && !conversations.length && <p className="p-5 text-sm text-white/45">No conversations yet.</p>}
        {conversations.map((conversation) => <button key={conversation.id} onClick={() => setSelected(conversation)} className={`block w-full border-b border-white/5 p-4 text-left transition ${selected?.id === conversation.id ? "bg-primary/10" : "hover:bg-white/[.04]"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{conversation.user_id ? "Signed-in customer" : "Anonymous visitor"}</span>{conversation.agent_paused && <Pause className="h-3.5 w-3.5 text-amber-300" />}</div><p className="mt-1 line-clamp-2 text-xs text-white/45">{conversation.creative_agent_messages?.at(-1)?.body || "New conversation"}</p><p className="mt-2 text-[10px] text-white/30">{new Date(conversation.updated_at).toLocaleString()}</p></button>)}
      </div>
      <div className="flex min-h-[440px] flex-col">{!selected ? <div className="m-auto text-center text-sm text-white/35"><MessageSquare className="mx-auto mb-3 h-7 w-7" />Select a conversation</div> : <>
        <div className="flex items-center justify-between border-b border-white/10 p-4"><div><p className="font-semibold">{selected.user_id ? "Signed-in customer" : "Anonymous visitor"}</p><p className="text-xs text-white/40">Visitor ID: {selected.visitor_id}</p></div><button onClick={() => void update(selected.agent_paused ? "resume" : "pause")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${selected.agent_paused ? "bg-primary text-black" : "border border-amber-300/30 text-amber-200"}`}>{selected.agent_paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{selected.agent_paused ? "Resume agent" : "Pause agent"}</button></div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">{selected.creative_agent_messages?.map((message) => <div key={message.id} className={`flex ${message.sender === "visitor" ? "justify-end" : ""}`}><div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${message.sender === "visitor" ? "bg-primary text-black" : message.sender === "admin" ? "border border-sky-400/30 bg-sky-400/10 text-sky-100" : "bg-white/[.07] text-white/70"}`}><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider opacity-60">{message.sender === "admin" ? "Admin / team" : message.sender === "agent" ? "Creative Agent" : "Customer"}</span>{message.body}</div></div>)}</div>
        <div className="flex gap-2 border-t border-white/10 p-3"><input value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void update("message") }} placeholder="Reply as the team…" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-primary" /><button onClick={() => void update("message")} className="rounded-lg bg-primary px-3 text-black"><Send className="h-4 w-4" /></button></div>
        <p className="px-4 pb-3 text-[11px] text-white/35"><Bot className="mr-1 inline h-3 w-3" />When resumed, the agent receives this complete thread—including admin messages—as its conversation context.</p>
      </>}</div>
    </div>
  </div>
}
