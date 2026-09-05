"use client"

import Navbar from "@/components/Navbar"
import { motion } from "framer-motion"
import { Download, Share2, ArrowLeft, User, Lock, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState, useEffect, use } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"
import { readProgress } from "@/lib/course-progress"
// @ts-ignore
import confetti from "canvas-confetti"

export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const { user } = useAuth()
    const [course, setCourse] = useState<any>(null)
    const [fullName, setFullName] = useState("")
    const [nameConfirmed, setNameConfirmed] = useState(false)
    const [eligible, setEligible] = useState<boolean | null>(null)
    const [downloading, setDownloading] = useState(false)
    const [shared, setShared] = useState(false)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()
            const { data } = await supabase
                .from('courses')
                .select('*')
                .eq('id', id)
                .single()
            if (data) {
                setCourse(data)
                // The certificate is the reward for finishing, so it has to be
                // earned here too — not just hidden behind a link on the course page.
                const done = readProgress(data.id, user?.id)
                setEligible(done.length >= (data.chapters || 1))
            }
        }
        load()
    }, [id, user?.id])

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

    if (!course || eligible === null) {
        return (
            <main className="min-h-screen bg-[#050508]">
                <Navbar />
                <div className="pt-32 flex justify-center">
                    <div className="animate-pulse text-white/40">Loading...</div>
                </div>
            </main>
        )
    }

    if (!eligible) {
        return (
            <main className="min-h-screen bg-[#050508]">
                <Navbar />
                <section className="pt-32 px-6 max-w-xl mx-auto">
                    <div className="glass-card p-10 rounded-3xl border-white/10 text-center space-y-6">
                        <div className="flex justify-center">
                            <div className="p-4 bg-white/5 rounded-full border border-white/10">
                                <Lock className="w-10 h-10 text-white/40" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold">Finish the course first</h1>
                        <p className="text-white/50 text-sm">
                            Your certificate for <span className="text-white font-semibold">{course.title}</span> unlocks
                            once every chapter is complete.
                        </p>
                        <Link href={`/courses/${id}`} className="btn-primary inline-flex items-center gap-2 px-8 py-3 font-bold">
                            <ArrowLeft className="w-4 h-4" /> Back to the course
                        </Link>
                    </div>
                </section>
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
                            <img src="/logo.png" alt="AI Director Hub" className="w-20 h-20 rounded-full" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold">Generate Your Certificate</h1>
                            <p className="text-white/50 text-sm">
                                Congratulations on completing <span className="text-white font-semibold">{course.title}</span>!
                            </p>
                        </div>
                        <div className="space-y-3 text-left">
                            <label className="text-xs font-bold text-white/40 flex items-center gap-2">
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

    // Painted by hand on a canvas rather than screenshotting the DOM: it gives a
    // crisp, print-sized PNG and does not depend on a screenshot library coping
    // with the page's gradients and web fonts.
    const handleDownload = async () => {
        setDownloading(true)
        try {
            const width = 2000
            const height = Math.round(width / 1.414)
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            ctx.fillStyle = '#0c0c14'
            ctx.fillRect(0, 0, width, height)
            ctx.strokeStyle = '#1a1a2e'
            ctx.lineWidth = 48
            ctx.strokeRect(24, 24, width - 48, height - 48)
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)'
            ctx.lineWidth = 3
            ctx.strokeRect(90, 90, width - 180, height - 180)

            const logo = new Image()
            logo.src = '/logo.png'
            await new Promise((resolve) => {
                logo.onload = resolve
                logo.onerror = resolve
            })
            if (logo.complete && logo.naturalWidth) {
                ctx.drawImage(logo, width / 2 - 90, 150, 180, 180)
            }

            ctx.textAlign = 'center'
            ctx.fillStyle = 'rgba(255,255,255,0.4)'
            ctx.font = 'bold 26px Helvetica, Arial, sans-serif'
            ctx.fillText('A I   D I R E C T O R   H U B', width / 2, 385)

            ctx.fillStyle = '#f59e0b'
            ctx.font = 'bold 96px Georgia, serif'
            ctx.fillText('CERTIFICATE', width / 2, 500)

            ctx.fillStyle = 'rgba(255,255,255,0.4)'
            ctx.font = '38px Helvetica, Arial, sans-serif'
            ctx.fillText('OF COMPLETION', width / 2, 560)

            ctx.fillStyle = 'rgba(255,255,255,0.6)'
            ctx.font = 'italic 32px Georgia, serif'
            ctx.fillText('Awarded to', width / 2, 660)

            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 110px Helvetica, Arial, sans-serif'
            ctx.fillText(fullName, width / 2, 790)

            ctx.strokeStyle = 'rgba(255,255,255,0.15)'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(width / 2 - 500, 830)
            ctx.lineTo(width / 2 + 500, 830)
            ctx.stroke()

            ctx.fillStyle = 'rgba(255,255,255,0.6)'
            ctx.font = '32px Helvetica, Arial, sans-serif'
            ctx.fillText('for successfully completing the course', width / 2, 910)
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 44px Helvetica, Arial, sans-serif'
            ctx.fillText(course.title, width / 2, 975)
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.font = '28px Helvetica, Arial, sans-serif'
            ctx.fillText('covering AI video tools, workflows, and production techniques.', width / 2, 1030)

            ctx.textAlign = 'left'
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.font = 'bold 24px Helvetica, Arial, sans-serif'
            ctx.fillText('COURSE INSTRUCTOR', 200, 1250)
            ctx.fillText('DATE ISSUED', width - 480, 1250)
            ctx.fillStyle = 'rgba(255,255,255,0.3)'
            ctx.font = '20px Helvetica, Arial, sans-serif'
            ctx.fillText('AI DIRECTOR HUB', 200, 1285)
            ctx.fillText(new Date().toLocaleDateString(), width - 480, 1285)
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.moveTo(200, 1210); ctx.lineTo(460, 1210)
            ctx.moveTo(width - 480, 1210); ctx.lineTo(width - 220, 1210)
            ctx.stroke()

            const link = document.createElement('a')
            link.download = `${fullName.replace(/\s+/g, '-').toLowerCase()}-certificate.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
        } finally {
            setDownloading(false)
        }
    }

    const handleShare = async () => {
        const shareData = {
            title: `${course.title} — Certificate of Completion`,
            text: `${fullName} completed ${course.title} on AI Director Hub.`,
            url: typeof window !== 'undefined' ? window.location.href : '',
        }
        try {
            if (navigator.share) {
                await navigator.share(shareData)
                return
            }
            await navigator.clipboard.writeText(shareData.url)
            setShared(true)
            setTimeout(() => setShared(false), 2000)
        } catch {
            // Cancelling the share sheet is not a failure worth shouting about.
        }
    }

    return (
        <main className="min-h-screen pb-20 bg-[#050508]">
            <Navbar />

            <section className="pt-32 px-6 max-w-5xl mx-auto flex flex-col items-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full lg:aspect-[1.414/1] bg-[#0c0c14] border-[8px] sm:border-[12px] border-[#1a1a2e] relative overflow-hidden shadow-2xl p-6 sm:p-12 md:p-20 gap-8 sm:gap-0 flex flex-col items-center justify-between text-center"
                >
                    {/* Decorative Corner Ornaments */}
                    <div className="absolute top-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-t-2 border-l-2 border-amber-400/30 m-4 rounded-tl-3xl" />
                    <div className="absolute top-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-t-2 border-r-2 border-amber-400/30 m-4 rounded-tr-3xl" />
                    <div className="absolute bottom-0 left-0 w-16 h-16 sm:w-32 sm:h-32 border-b-2 border-l-2 border-amber-400/30 m-4 rounded-bl-3xl" />
                    <div className="absolute bottom-0 right-0 w-16 h-16 sm:w-32 sm:h-32 border-b-2 border-r-2 border-amber-400/30 m-4 rounded-br-3xl" />

                    {/* Watermark Logo */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none">
                        <img src="/logo.png" alt="" className="w-64 h-64 sm:w-96 sm:h-96 rounded-full" />
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 mb-6">
                            <img src="/logo.png" alt="AI Director Hub" className="w-16 h-16 sm:w-24 sm:h-24 rounded-full" />
                            <span className="text-[10px] md:text-xs tracking-[0.3em] text-white/40 font-bold">AI DIRECTOR HUB</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl md:text-5xl font-serif text-amber-500 font-bold tracking-tight">CERTIFICATE</h1>
                        <h2 className="text-lg md:text-xl font-medium tracking-widest text-white/40">OF COMPLETION</h2>
                    </div>

                    <div className="space-y-6">
                        <p className="text-white/60 italic">Awarded to</p>
                        <h3 className="text-2xl sm:text-4xl md:text-6xl font-bold tracking-tight text-white border-b-2 border-white/10 pb-4 px-4 sm:px-12 break-words max-w-full">
                            {fullName}
                        </h3>
                        <p className="text-white/60 max-w-lg mx-auto">
                            for successfully completing the course <br />
                            <span className="text-white font-bold">{course.title}</span> <br />
                            covering AI video tools, workflows, and production techniques.
                        </p>
                    </div>

                    <div className="w-full flex justify-between items-end mt-6 sm:mt-12 pb-2 sm:pb-4">
                        <div className="text-left space-y-1">
                            <div className="h-0.5 w-32 bg-white/20 mb-2" />
                            <p className="text-xs font-bold text-white/50">COURSE INSTRUCTOR</p>
                            <p className="text-[10px] text-white/30">AI DIRECTOR HUB</p>
                        </div>
                        <div className="text-right space-y-1">
                            <div className="h-0.5 w-32 bg-white/20 mb-2" />
                            <p className="text-xs font-bold text-white/50">DATE ISSUED</p>
                            <p className="text-[10px] text-white/30">{new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                </motion.div>

                <div className="flex flex-col sm:flex-row items-center gap-4 mt-12">
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="btn-primary flex items-center gap-2 px-8 py-3 bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-60"
                    >
                        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {downloading ? 'Preparing...' : 'Download Certificate'}
                    </button>
                    <button
                        onClick={handleShare}
                        className="flex items-center gap-2 px-8 py-3 glass rounded-xl hover:bg-white/10 transition-colors"
                    >
                        <Share2 className="w-4 h-4" /> {shared ? '✓ Link copied!' : 'Share Achievement'}
                    </button>
                    <Link href="/courses" className="text-white/40 hover:text-white transition-colors text-sm flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Back to Academy
                    </Link>
                </div>
            </section>
        </main>
    )
}
