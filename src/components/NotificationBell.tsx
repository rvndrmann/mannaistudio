"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Trophy, MessageSquare, Info } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { fetchNotifications, getJobChatClient, markNotificationsRead, type Notification } from "@/lib/job-chat"

function notificationIcon(type: string) {
    if (type === "job_won") return <Trophy className="w-4 h-4 text-amber-400" />
    if (type === "job_message") return <MessageSquare className="w-4 h-4 text-cyan-400" />
    return <Info className="w-4 h-4 text-white/40" />
}

export default function NotificationBell() {
    const { user } = useAuth()
    const router = useRouter()
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const unreadCount = notifications.filter((n) => !n.read).length

    useEffect(() => {
        if (!user) { setNotifications([]); return }
        let active = true
        const load = async () => {
            try {
                const supabase = await getJobChatClient()
                if (!supabase) return
                const items = await fetchNotifications(supabase, user.id)
                if (active) setNotifications(items)
            } catch {}
        }
        load()
        const interval = window.setInterval(load, 30000)
        return () => { active = false; window.clearInterval(interval) }
    }, [user])

    useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", onClickOutside)
        return () => document.removeEventListener("mousedown", onClickOutside)
    }, [])

    const toggleOpen = async () => {
        const next = !open
        setOpen(next)
        if (next && unreadCount > 0 && user) {
            try {
                const supabase = await getJobChatClient()
                if (supabase) {
                    await markNotificationsRead(supabase, user.id)
                    setNotifications((current) => current.map((n) => ({ ...n, read: true })))
                }
            } catch {}
        }
    }

    const openNotification = (notification: Notification) => {
        setOpen(false)
        if (notification.jobId) {
            if (notification.type === "job_message" || notification.type === "job_won") {
                router.push(`/messages?job=${notification.jobId}`)
            } else {
                router.push(`/services?job=${notification.jobId}`)
            }
        }
    }

    if (!user) return null

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={toggleOpen}
                className="relative flex items-center justify-center p-2.5 bg-white/10 rounded-xl hover:bg-white/20 transition-all"
                title="Notifications"
            >
                <Bell className="w-4 h-4 text-white/70" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto rounded-2xl border border-white/10 bg-[#13131a] shadow-2xl z-50"
                    >
                        <div className="p-4 border-b border-white/5">
                            <p className="text-sm font-bold">Notifications</p>
                        </div>
                        {notifications.length === 0 ? (
                            <p className="p-6 text-center text-sm text-white/35">No notifications yet.</p>
                        ) : (
                            notifications.map((notification) => (
                                <button
                                    key={notification.id}
                                    onClick={() => openNotification(notification)}
                                    className={cn(
                                        "w-full text-left p-4 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors",
                                        !notification.read && "bg-primary/5"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 shrink-0">{notificationIcon(notification.type)}</div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold leading-snug">{notification.title}</p>
                                            <p className="text-xs text-white/50 mt-1 line-clamp-2">{notification.body}</p>
                                            <p className="text-[10px] text-white/25 mt-1">{new Date(notification.createdAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
