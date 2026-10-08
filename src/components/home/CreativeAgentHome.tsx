"use client"

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUp, Bot, Check, FileUp, Link2, Paperclip, Sparkles, User } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"

type Message = { id?: string; role: "agent" | "user" | "admin"; text: string }
type Conversation = { id: string; agent_paused: boolean }

const quickStarts = ["Create a UGC Ad", "Create a Product Ad", "Create a Cinematic Ad", "Create a Real Estate Video", "I Have a Reference"]

function starterText(action: string) {
  if (action === "I Have a Reference") return "I have a reference creative I want to use as inspiration."
  return `I want to ${action.replace("Create ", "create ").replace(" a ", " a ").replace(" Ad", " ad")}.`
}

export default function CreativeAgentHome() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState("")
  const [files, setFiles] = useState<string[]>([])
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const summary = useMemo(() => {
    const userText = messages.filter((message) => message.role === "user").map((message) => message.text).join(" ")
    return userText.length > 40 ? userText : "Your creative brief will appear here as we learn what you need."
  }, [messages])

  function mapMessage(message: { id?: string; sender: string; body: string }): Message {
    return { id: message.id, text: message.body, role: message.sender === "visitor" ? "user" : message.sender === "admin" ? "admin" : "agent" }
  }

  useEffect(() => {
    const visitorKey = "creative-agent-visitor-id"
    let visitorId = localStorage.getItem(visitorKey)
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem(visitorKey, visitorId) }
    fetch("/api/creative-agent/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId }) })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) { setConversation(data.conversation); setMessages((data.messages ?? []).map(mapMessage)) } })
      .catch(() => undefined)
  }, [])

  function send(text = draft) {
    const clean = text.trim()
    if (!clean) return
    const visitorId = localStorage.getItem("creative-agent-visitor-id")
    if (!conversation || !visitorId) return
    setMessages((current) => [...current, { role: "user", text: clean }])
    setDraft("")
    fetch(`/api/creative-agent/conversations/${conversation.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId, body: clean }) })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.agentMessage) setMessages((current) => [...current, mapMessage(data.agentMessage)]) })
      .catch(() => undefined)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    send()
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const names = Array.from(event.target.files ?? []).map((file) => file.name)
    if (names.length) {
      setFiles((current) => [...current, ...names])
      setMessages((current) => [...current, { role: "user", text: `Selected assets: ${names.join(", ")}` }])
    }
    event.target.value = ""
  }

  return (
    <main className="min-h-screen bg-[#090909] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> AI Director Hub</Link>
        <div className="flex items-center gap-4 text-xs text-white/50"><span>Human-led production</span>{user ? <Link href="/hire-us/projects" className="text-white hover:text-primary">My Projects</Link> : <span>Sign in at checkout</span>}</div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 pt-12 lg:grid-cols-[1.25fr_.75fr] lg:px-6 lg:pt-20">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-primary"><Bot className="h-3.5 w-3.5" /> Creative Agent</div>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">What do you want to create?</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55 sm:text-lg">Tell me what you need, or paste your product URL. I’ll collect the important details, organise your creative brief, and send it to our team for production.</p>

          <div className="mt-8 flex flex-wrap gap-2">{quickStarts.map((action) => <button key={action} onClick={() => send(starterText(action))} className="rounded-full border border-white/12 bg-white/[.04] px-3.5 py-2 text-xs text-white/75 transition hover:border-primary/50 hover:text-white">{action}</button>)}</div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[.035]">
            <div className="flex min-h-[300px] flex-col gap-4 p-5">
              {!messages.length && <div className="my-auto text-center text-sm text-white/35">Start with a sentence like: “I sell women&apos;s running shoes and need three 30-second Instagram ads.”</div>}
              {messages.map((message, index) => <div key={message.id ?? index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}><div className={`flex max-w-[85%] gap-2 rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-primary text-black" : message.role === "admin" ? "border border-sky-400/30 bg-sky-400/10 text-sky-100" : "bg-white/[.07] text-white/75"}`}>{message.role === "agent" ? <Bot className="mt-0.5 h-4 w-4 shrink-0" /> : <User className="mt-0.5 h-4 w-4 shrink-0" />}{message.role === "admin" && <span className="sr-only">Team: </span>}{message.text}</div></div>)}
            </div>
            <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-white/10 p-3"><button type="button" aria-label="Upload assets" onClick={() => fileRef.current?.click()} className="rounded-xl p-3 text-white/45 hover:bg-white/10 hover:text-white"><Paperclip className="h-5 w-5" /></button><input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={onFiles} /><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Tell me what you want to make..." className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm outline-none placeholder:text-white/30" /><button type="submit" className="rounded-xl bg-primary p-3 text-black transition hover:brightness-110"><ArrowUp className="h-5 w-5" /></button></form>
          </div>
          {files.length > 0 && <p className="mt-3 flex items-center gap-2 text-xs text-white/45"><FileUp className="h-3.5 w-3.5" /> {files.length} asset{files.length === 1 ? "" : "s"} noted for this conversation</p>}
        </div>

        <aside className="h-fit rounded-2xl border border-white/10 bg-white/[.035] p-5 lg:mt-24"><div className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4 text-primary" /> Your creative brief</div><p className="mt-4 text-sm leading-relaxed text-white/50">{summary}</p>{messages.length > 0 && <><div className="my-5 h-px bg-white/10" /><div className="space-y-3 text-xs text-white/45"><p><span className="text-white/70">Status:</span> {conversation?.agent_paused ? "Team is reviewing your request" : "Gathering details"}</p><p><span className="text-white/70">Assets:</span> {files.length ? `${files.length} selected` : "None yet"}</p></div><Link href="/hire-us" className="mt-6 flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-black hover:brightness-110">Review order <Link2 className="h-4 w-4" /></Link></>}</aside>
      </section>
    </main>
  )
}
