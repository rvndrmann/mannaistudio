"use client"

import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { fetchChatThreads, fetchJobMessages, getJobChatClient, sendJobMessage, type ChatThread, type JobMessage } from "@/lib/job-chat"
import { cn } from "@/lib/utils"
import { Loader2, MessageSquare, Send, Search, ArrowLeft } from "lucide-react"
import { FormEvent, useEffect, useRef, useState } from "react"

export default function MessagesPage() {
    const { user, loading, signInWithGoogle } = useAuth()
    const [threads, setThreads] = useState<ChatThread[]>([])
    const [activeThread, setActiveThread] = useState<ChatThread | null>(null)
    const [messages, setMessages] = useState<JobMessage[]>([])
    const [chatInput, setChatInput] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isLoadingThreads, setIsLoadingThreads] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const chatEndRef = useRef<HTMLDivElement>(null)
    const pendingJobRef = useRef<string | null>(null)

    // Handle ?job=xxx query param
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const jobId = params.get("job")
        if (jobId) pendingJobRef.current = jobId
    }, [])

    // Load threads
    useEffect(() => {
        if (!user) { setIsLoadingThreads(false); return }
        let active = true
        const load = async () => {
            try {
                const supabase = await getJobChatClient()
                if (!supabase || !active) return
                const t = await fetchChatThreads(supabase, user.id)
                if (!active) return
                setThreads(t)

                // Auto-open from query param
                if (pendingJobRef.current) {
                    const match = t.find((thread) => thread.jobId === pendingJobRef.current)
                    if (match) {
                        setActiveThread(match)
                        pendingJobRef.current = null
                    }
                }
            } catch {}
            if (active) setIsLoadingThreads(false)
        }
        load()
        const interval = window.setInterval(load, 15000)
        return () => { active = false; window.clearInterval(interval) }
    }, [user])

    // Load messages for active thread
    useEffect(() => {
        if (!activeThread) { setMessages([]); return }
        let active = true
        const load = async () => {
            try {
                const supabase = await getJobChatClient()
                if (!supabase || !active) return
                const msgs = await fetchJobMessages(supabase, activeThread.jobId)
                if (active) setMessages(msgs)
            } catch {}
        }
        load()
        const interval = window.setInterval(load, 4000)
        return () => { active = false; window.clearInterval(interval) }
    }, [activeThread?.jobId])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const handleSend = async (e: FormEvent) => {
        e.preventDefault()
        if (!user || !activeThread || !chatInput.trim()) return
        setIsSending(true)
        try {
            const supabase = await getJobChatClient()
            if (!supabase) throw new Error("Supabase unavailable")
            const sent = await sendJobMessage(supabase, {
                jobId: activeThread.jobId,
                senderId: user.id,
                senderName: user.user_metadata?.full_name || user.email || "User",
                content: chatInput.trim(),
            })
            setMessages((cur) => [...cur, sent])
            setChatInput("")
            setThreads((cur) =>
                cur.map((t) =>
                    t.jobId === activeThread.jobId
                        ? { ...t, lastMessage: sent.content, lastMessageAt: sent.createdAt }
                        : t
                )
            )
        } catch {}
        setIsSending(false)
    }

    const filteredThreads = threads.filter((t) => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return t.jobTitle.toLowerCase().includes(q) || t.otherUserName.toLowerCase().includes(q)
    })

    if (loading) {
        return (
            <main className="min-h-screen">
                <Navbar />
                <div className="pt-32 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            </main>
        )
    }

    if (!user) {
        return (
            <main className="min-h-screen">
                <Navbar />
                <div className="pt-32 text-center px-6">
                    <MessageSquare className="w-16 h-16 text-white/15 mx-auto mb-6" />
                    <h1 className="text-3xl font-bold mb-3">Messages</h1>
                    <p className="text-white/50 mb-8">Sign in to see your project conversations.</p>
                    <button onClick={signInWithGoogle} className="btn-primary px-8 py-3">Sign In</button>
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen">
            <Navbar />
            <div className="pt-24 px-4 md:px-6 max-w-7xl mx-auto" style={{ height: "calc(100vh - 0px)" }}>
                <div className="flex h-[calc(100vh-7rem)] rounded-2xl border border-white/10 overflow-hidden bg-[#0c0c14]">
                    {/* Thread list — hidden on mobile when a thread is open */}
                    <aside className={cn(
                        "w-full md:w-[340px] lg:w-[380px] border-r border-white/10 flex flex-col shrink-0",
                        activeThread ? "hidden md:flex" : "flex"
                    )}>
                        <div className="p-4 border-b border-white/5 shrink-0">
                            <h2 className="text-lg font-bold mb-3">Messages</h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search conversations"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {isLoadingThreads ? (
                                <div className="p-8 text-center text-white/30">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
                                    Loading...
                                </div>
                            ) : filteredThreads.length === 0 ? (
                                <div className="p-8 text-center">
                                    <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
                                    <p className="text-sm text-white/30">No conversations yet.</p>
                                    <p className="text-xs text-white/20 mt-1">Win a job bid to start chatting with clients.</p>
                                </div>
                            ) : (
                                filteredThreads.map((thread) => (
                                    <button
                                        key={thread.jobId}
                                        onClick={() => setActiveThread(thread)}
                                        className={cn(
                                            "w-full text-left px-4 py-4 border-b border-white/5 hover:bg-white/5 transition-colors",
                                            activeThread?.jobId === thread.jobId && "bg-primary/10 border-l-2 border-l-primary"
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                                {thread.otherUserAvatar ? (
                                                    <img src={thread.otherUserAvatar} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-sm font-bold text-white/50">
                                                        {thread.otherUserName.charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-bold truncate">{thread.otherUserName}</p>
                                                    {thread.lastMessageAt && (
                                                        <span className="text-[10px] text-white/25 shrink-0">
                                                            {formatTime(thread.lastMessageAt)}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-white/40 truncate mt-0.5">{thread.jobTitle}</p>
                                                {thread.lastMessage && (
                                                    <p className="text-xs text-white/30 truncate mt-1">{thread.lastMessage}</p>
                                                )}
                                            </div>
                                            {thread.unreadCount > 0 && (
                                                <span className="shrink-0 mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-black">
                                                    {thread.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </aside>

                    {/* Chat panel */}
                    <div className={cn(
                        "flex-1 flex flex-col",
                        !activeThread ? "hidden md:flex" : "flex"
                    )}>
                        {activeThread ? (
                            <>
                                {/* Chat header */}
                                <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3 shrink-0 bg-white/[0.02]">
                                    <button
                                        onClick={() => setActiveThread(null)}
                                        className="md:hidden p-2 -ml-2 hover:bg-white/10 rounded-xl text-white/50"
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                    <div className="shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                        {activeThread.otherUserAvatar ? (
                                            <img src={activeThread.otherUserAvatar} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-sm font-bold text-white/50">
                                                {activeThread.otherUserName.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold truncate">{activeThread.otherUserName}</p>
                                        <p className="text-xs text-white/35 truncate">{activeThread.jobTitle}</p>
                                    </div>
                                </div>

                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
                                    {messages.length === 0 ? (
                                        <p className="text-center text-sm text-white/25 mt-16">No messages yet. Say hello and discuss the project.</p>
                                    ) : (
                                        messages.map((msg) => {
                                            const isMine = msg.senderId === user.id
                                            return (
                                                <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                                                    <div className={cn(
                                                        "max-w-[75%] rounded-2xl px-4 py-2.5",
                                                        isMine
                                                            ? "bg-primary text-black rounded-br-md"
                                                            : "bg-white/10 text-white/90 rounded-bl-md"
                                                    )}>
                                                        {!isMine && (
                                                            <p className="text-[10px] font-bold text-white/40 mb-0.5">{msg.senderName}</p>
                                                        )}
                                                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                                                        <p className={cn("text-[9px] mt-1", isMine ? "text-black/50" : "text-white/30")}>
                                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                        </p>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Input */}
                                <form onSubmit={handleSend} className="px-5 py-4 border-t border-white/5 bg-white/[0.02] flex gap-3 shrink-0">
                                    <input
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        placeholder="Type a message..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isSending || !chatInput.trim()}
                                        className="btn-primary px-5 py-3 flex items-center gap-2 disabled:opacity-40"
                                    >
                                        {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </form>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <MessageSquare className="w-16 h-16 text-white/10 mx-auto mb-4" />
                                    <h2 className="text-xl font-bold text-white/40">Select a conversation</h2>
                                    <p className="text-sm text-white/25 mt-2">Choose a project chat from the sidebar.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    )
}

function formatTime(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
    return d.toLocaleDateString([], { month: "short", day: "numeric" })
}
