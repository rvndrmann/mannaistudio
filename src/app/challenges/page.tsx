"use client"

import Navbar from "@/components/Navbar"
import { motion } from "framer-motion"
import { Zap, Trophy, Clock, Users, ArrowUpRight, Send, Star, ExternalLink, Play, X } from "lucide-react"
import { challenges as mockChallenges } from "@/lib/data"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { AnimatePresence } from "framer-motion"

export default function ChallengesPage() {
    const [activeTab, setActiveTab] = useState("active")
    const [watchingVideoUrl, setWatchingVideoUrl] = useState<string | null>(null)
    const [watchingStudentName, setWatchingStudentName] = useState<string | null>(null)
    const [challenges, setChallenges] = useState(mockChallenges)

    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from('challenges')
                    .select('*')
                    .order('created_at', { ascending: true })
                if (!error && data) {
                    const mapped = data.map((c: any) => ({
                        id: c.id,
                        title: c.title,
                        description: c.description,
                        prize: c.prize,
                        deadline: c.deadline ? new Date(c.deadline).toLocaleDateString() : '',
                        participants: c.participants,
                        difficulty: c.difficulty,
                        winnerId: c.winner_id || null,
                        submissions: [],
                    }))
                    setChallenges(mapped)
                }
            } catch {}
        }
        load()
    }, [])

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            <section className="pt-32 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div className="space-y-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/10 rounded-full border border-amber-400/20 text-xs font-bold text-amber-500 uppercase tracking-widest"
                        >
                            <Zap className="w-3.5 h-3.5 fill-amber-500" /> Season 1: Genesis
                        </motion.div>
                        <motion.h1
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-4xl md:text-5xl font-bold tracking-tight"
                        >
                            Weekly <span className="text-primary">Challenges</span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-white/60 max-w-xl"
                        >
                            Compete with other creators, win cash rewards, and get featured on our main hall of fame. New challenges every Monday.
                        </motion.p>
                    </div>

                    <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10 h-fit">
                        {["active", "past", "leaderboard"].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "px-6 py-2 rounded-xl text-sm font-medium transition-all capitalize",
                                    activeTab === tab ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-white/40 hover:text-white"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        {challenges.map((challenge, i) => (
                            <motion.div
                                key={challenge.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="glass-card p-1 overflow-hidden group"
                            >
                                <div className="p-8">
                                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center text-2xl font-bold text-primary italic">
                                                #{i + 1}
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-bold group-hover:text-primary transition-colors">{challenge.title}</h3>
                                                <p className="text-sm text-white/40">{challenge.difficulty} Difficulty</p>
                                            </div>
                                        </div>
                                        <div className="px-6 py-3 bg-amber-400/10 rounded-2xl border border-amber-400/20 text-center">
                                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">PRIZE POOL</p>
                                            <p className="text-2xl font-black text-amber-500">{challenge.prize}</p>
                                        </div>
                                    </div>

                                    <p className="text-white/60 mb-8 leading-relaxed">
                                        {challenge.description}
                                    </p>

                                    {/* Winner Section */}
                                    {challenge.winnerId && (
                                        <div className="mb-8 p-6 bg-primary/5 rounded-3xl border border-primary/20 relative overflow-hidden group/winner">
                                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/winner:opacity-20 transition-opacity">
                                                <Trophy className="w-24 h-24 text-primary" />
                                            </div>
                                            <div className="flex flex-col md:flex-row gap-6">
                                                <div className="w-full md:w-1/2 aspect-video relative rounded-2xl overflow-hidden group/thumb cursor-pointer"
                                                    onClick={() => {
                                                        const winnerSub = challenge.submissions.find(s => s.id === challenge.winnerId);
                                                        if (winnerSub) {
                                                            setWatchingVideoUrl(winnerSub.videoUrl);
                                                            setWatchingStudentName(winnerSub.studentName);
                                                        }
                                                    }}>
                                                    <img
                                                        src={challenge.submissions.find(s => s.id === challenge.winnerId)?.thumbnail}
                                                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-500"
                                                        alt="Winner"
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                                        <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
                                                            <Trophy className="w-6 h-6 text-white fill-white" />
                                                        </div>
                                                    </div>
                                                    <div className="absolute top-3 left-3 bg-primary text-white font-bold text-[10px] px-3 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-widest shadow-lg">
                                                        <Star className="w-3 h-3 fill-white" /> Winner
                                                    </div>
                                                </div>
                                                <div className="flex flex-col justify-center">
                                                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Weekly Champion</p>
                                                    <h4 className="text-xl font-bold mb-2">@{challenge.submissions.find(s => s.id === challenge.winnerId)?.studentName}</h4>
                                                    <p className="text-sm text-white/40 italic mb-4">"Winning this challenge has been an incredible journey. The tools provided in this course are world-class."</p>
                                                    <div className="flex items-center gap-4">
                                                        <button
                                                            onClick={() => {
                                                                const winnerSub = challenge.submissions.find(s => s.id === challenge.winnerId);
                                                                if (winnerSub) {
                                                                    setWatchingVideoUrl(winnerSub.videoUrl);
                                                                    setWatchingStudentName(winnerSub.studentName);
                                                                }
                                                            }}
                                                            className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:scale-105 transition-transform"
                                                        >
                                                            Watch Winner Video
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Other Submissions Section */}
                                    {challenge.submissions.length > 0 && (
                                        <div className="mb-8">
                                            <h4 className="text-xs font-bold text-white/20 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                <Users className="w-3 h-3" /> Community Submissions
                                            </h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {challenge.submissions.map((sub) => (
                                                    <div key={sub.id} className="group/sub relative aspect-video rounded-xl overflow-hidden cursor-pointer border border-white/5"
                                                        onClick={() => {
                                                            setWatchingVideoUrl(sub.videoUrl);
                                                            setWatchingStudentName(sub.studentName);
                                                        }}>
                                                        <img src={sub.thumbnail} className="w-full h-full object-cover group-hover/sub:scale-110 transition-transform duration-500" alt={sub.studentName} />
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/sub:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
                                                            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm mb-2">
                                                                <ExternalLink className="w-4 h-4 text-white" />
                                                            </div>
                                                            <p className="text-[10px] font-bold text-white truncate w-full text-center">@{sub.studentName}</p>
                                                        </div>
                                                        {challenge.winnerId === sub.id && (
                                                            <div className="absolute top-2 right-2 bg-primary p-1 rounded-full shadow-lg">
                                                                <Trophy className="w-2.5 h-2.5 text-white" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-y border-white/5">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">DEADLINE</p>
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <Clock className="w-4 h-4 text-primary" /> {challenge.deadline}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">ENTRIES</p>
                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <Users className="w-4 h-4 text-cyan-400" /> {challenge.participants} Joined
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">FORMAT</p>
                                            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                                                16:9 MP4
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">REWARDS</p>
                                            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                                                Cash + Badges
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-center gap-4 mt-8">
                                        <button className="w-full sm:w-auto btn-primary flex items-center justify-center gap-2 px-10 py-3.5">
                                            Submit Entry <Send className="w-4 h-4" />
                                        </button>
                                        <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 glass rounded-xl hover:bg-white/10 transition-colors text-sm font-medium">
                                            View Guidelines <ArrowUpRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div className="space-y-8">
                        {/* Top Creators Leaderboard */}
                        <div className="glass-card p-6 rounded-2xl border-white/10 h-fit">
                            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-amber-500" /> Hall of Fame
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { name: "Creator_One", xp: "12,400", avatar: "C1" },
                                    { name: "AI_Wizard", xp: "10,200", avatar: "AW" },
                                    { name: "NeonSoul", xp: "9,850", avatar: "NS" },
                                    { name: "PixelPerfect", xp: "8,900", avatar: "PP" },
                                    { name: "SoraMaster", xp: "7,500", avatar: "SM" }
                                ].map((user, i) => (
                                    <div key={user.name} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className={cn(
                                                "w-5 font-bold text-xs italic",
                                                i === 0 ? "text-amber-500" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-700" : "text-white/20"
                                            )}>
                                                #{i + 1}
                                            </span>
                                            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-[10px] font-bold">
                                                {user.avatar}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">{user.name}</p>
                                                <p className="text-[10px] text-white/40">{user.xp} SEASON XP</p>
                                            </div>
                                        </div>
                                        <Star className={cn("w-4 h-4", i < 3 ? "text-amber-500 fill-amber-500" : "text-white/5")} />
                                    </div>
                                ))}
                            </div>
                            <button className="w-full mt-6 py-3 text-xs font-bold text-white/40 hover:text-white transition-colors border-t border-white/5 pt-6">
                                VIEW ALL CREATORS
                            </button>
                        </div>

                        {/* Recent Wins */}
                        <div className="glass-card p-6 rounded-2xl border-white/10">
                            <h3 className="text-lg font-bold mb-4">Latest Winner Spotlight</h3>
                            <div className="relative aspect-video rounded-xl overflow-hidden mb-4 group cursor-pointer"
                                onClick={() => {
                                    setWatchingVideoUrl("https://www.w3schools.com/html/mov_bbb.mp4");
                                    setWatchingStudentName("CinemaAI");
                                }}>
                                <img
                                    src="https://images.unsplash.com/photo-1614728263952-84ea206f99b6?auto=format&fit=crop&q=80&w=800"
                                    alt="Winner"
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play className="w-10 h-10 text-white fill-white" />
                                </div>
                                <div className="absolute top-3 right-3 bg-amber-500 text-black font-bold text-[10px] px-2 py-0.5 rounded-full shadow-lg">
                                    CHAMPION
                                </div>
                            </div>
                            <p className="text-sm font-bold">@CinemaAI</p>
                            <p className="text-xs text-white/40 italic">Challenge: "Parallel Worlds"</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Video Player Modal */}
            <AnimatePresence>
                {watchingVideoUrl && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-xl"
                        onClick={() => setWatchingVideoUrl(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f0f15] rounded-3xl border border-white/10 overflow-hidden w-full max-w-5xl shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">Submission by @{watchingStudentName}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="w-2 h-2 rounded-full bg-primary" />
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Community Spotlight</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setWatchingVideoUrl(null)}
                                    className="p-2 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all"
                                >
                                    <X className="w-7 h-7" />
                                </button>
                            </div>
                            <div className="aspect-video bg-black flex items-center justify-center">
                                <video
                                    src={watchingVideoUrl}
                                    controls
                                    autoPlay
                                    className="w-full h-full"
                                />
                            </div>
                            <div className="p-6 bg-white/[0.02] flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-xs">
                                            {watchingStudentName?.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold">{watchingStudentName}</p>
                                            <p className="text-[10px] text-white/40">Student Creator</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/10">
                                        <Star className="w-3.5 h-3.5" /> Favorite
                                    </button>
                                    <button className="flex items-center gap-2 px-4 py-2 bg-primary rounded-xl text-xs font-bold transition-all hover:scale-105">
                                        Support Creator
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    )
}
