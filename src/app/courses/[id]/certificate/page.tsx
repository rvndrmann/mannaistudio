"use client"

import Navbar from "@/components/Navbar"
import { motion } from "framer-motion"
import { Download, Share2, Award, ShieldCheck, ArrowLeft, User } from "lucide-react"
import Link from "next/link"
import { useState, useEffect, use } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"
// @ts-ignore
import confetti from "canvas-confetti"

export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const { user } = useAuth()
    const [course, setCourse] = useState<any>(null)
    const [fullName, setFullName] = useState("")
    const [nameConfirmed, setNameConfirmed] = useState(false)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()
            const { data } = await supabase
                .from('courses')
                .select('*')
                .eq('id', id)
                .single()
            if (data) setCourse(data)
        }
        load()
    }, [id])

    useEffect(() => {
        if (user) {
            setFullName(user.user_metadata?.full_name || '')
        }
    }, [user])

    useEffect(() => {
        if (!nameConfirmed) return
        const duration = 5 * 1000
        const animationEnd = Date.now() + duration
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 }

        function randomInRange(min: number, max: number) {
            return Math.random() * (max - min) + min
        }

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now()
            if (timeLeft <= 0) return clearInterval(interval)
            const particleCount = 50 * (timeLeft / duration)
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } })
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } })
        }, 250)

        return () => clearInterval(interval)
    }, [nameConfirmed])

    if (!course) {
        return (
            <main className="min-h-screen bg-[#050508]">
                <Navbar />
                <div className="pt-32 flex justify-center">
                    <div className="animate-pulse text-white/40">Loading...</div>
                </div>
            </main>
        )
    }

    // Name confirmation step
    if (!nameConfirmed) {
        return (
            <main className="min-h-screen pb-20 bg-[#050508]">
                <Navbar />
                <section className="pt-32 px-6 max-w-xl mx-auto flex flex-col items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-10 rounded-3xl border-white/10 w-full text-center space-y-8"
                    >
                        <div className="flex justify-center">
                            <div className="p-4 bg-amber-400/10 rounded-full border border-amber-400/20">
                                <Award className="w-12 h-12 text-amber-500" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold">Generate Your Certificate</h1>
                            <p className="text-white/50 text-sm">
                                Congratulations on completing <span className="text-white font-semibold">{course.title}</span>!
                            </p>
                        </div>
                        <div className="space-y-3 text-left">
                            <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                                <User className="w-3 h-3" /> Your Full Name
                            </label>
                            <input
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-lg font-semibold focus:outline-none focus:border-primary transition-colors"
                                placeholder="Enter your full name"
                            />
                            <p className="text-[10px] text-white/30">
                                This name will appear on your certificate. Please make sure it is correct.
                            </p>
                        </div>
                        <button
                            onClick={() => fullName.trim() && setNameConfirmed(true)}
                            disabled={!fullName.trim()}
                            className="btn-primary w-full py-3 text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Generate Certificate
                        </button>
                    </motion.div>
                </section>
            </main>
        )
    }

    return (
        <main className="min-h-screen pb-20 bg-[#050508]">
            <Navbar />

            <section className="pt-32 px-6 max-w-5xl mx-auto flex flex-col items-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full aspect-[1.414/1] bg-[#0c0c14] border-[12px] border-[#1a1a2e] relative overflow-hidden shadow-2xl p-12 md:p-20 flex flex-col items-center justify-between text-center"
                >
                    {/* Decorative Corner Ornaments */}
                    <div className="absolute top-0 left-0 w-32 h-32 border-t-2 border-l-2 border-amber-400/30 m-4 rounded-tl-3xl" />
                    <div className="absolute top-0 right-0 w-32 h-32 border-t-2 border-r-2 border-amber-400/30 m-4 rounded-tr-3xl" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 border-b-2 border-l-2 border-amber-400/30 m-4 rounded-bl-3xl" />
                    <div className="absolute bottom-0 right-0 w-32 h-32 border-b-2 border-r-2 border-amber-400/30 m-4 rounded-br-3xl" />

                    {/* Watermark Logo */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none">
                        <ShieldCheck className="w-96 h-96" />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-center mb-6">
                            <div className="p-4 bg-amber-400/10 rounded-full border border-amber-400/20">
                                <Award className="w-12 h-12 text-amber-500" />
                            </div>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-serif text-amber-500 font-bold tracking-tight">CERTIFICATE</h1>
                        <h2 className="text-lg md:text-xl font-medium tracking-widest text-white/40">OF COMPLETION</h2>
                    </div>

                    <div className="space-y-6">
                        <p className="text-white/60 italic">This is to certify that</p>
                        <h3 className="text-4xl md:text-6xl font-bold tracking-tight text-white border-b-2 border-white/10 pb-4 px-12">
                            {fullName}
                        </h3>
                        <p className="text-white/60 max-w-lg mx-auto">
                            has successfully completed the professional course <br />
                            <span className="text-white font-bold">{course.title}</span> <br />
                            demonstrating mastery over AI video tools, workflows, and production techniques.
                        </p>
                    </div>

                    <div className="w-full flex justify-between items-end mt-12 pb-4">
                        <div className="text-left space-y-1">
                            <div className="h-0.5 w-32 bg-white/20 mb-2" />
                            <p className="text-xs font-bold text-white/50">PLATFORM ADMIN</p>
                            <p className="text-[10px] text-white/30">AI MASTERY INSTITUTE</p>
                        </div>
                        <div className="text-right space-y-1">
                            <div className="h-0.5 w-32 bg-white/20 mb-2" />
                            <p className="text-xs font-bold text-white/50">DATE ISSUED</p>
                            <p className="text-[10px] text-white/30">{new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="absolute bottom-8 flex items-center gap-2 opacity-20">
                        <ShieldCheck className="w-4 h-4" />
                        <span className="text-[10px] tracking-widest font-mono">VERIFY: AIM-{id.slice(-4).toUpperCase()}-{Date.now().toString(36).slice(-4).toUpperCase()}</span>
                    </div>
                </motion.div>

                <div className="flex flex-col sm:flex-row items-center gap-4 mt-12">
                    <button className="btn-primary flex items-center gap-2 px-8 py-3 bg-amber-500 text-black hover:bg-amber-400">
                        <Download className="w-4 h-4" /> Download Certificate
                    </button>
                    <button className="flex items-center gap-2 px-8 py-3 glass rounded-xl hover:bg-white/10 transition-colors">
                        <Share2 className="w-4 h-4" /> Share Achievement
                    </button>
                    <Link href="/courses" className="text-white/40 hover:text-white transition-colors text-sm flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Back to Courses
                    </Link>
                </div>
            </section>
        </main>
    )
}
