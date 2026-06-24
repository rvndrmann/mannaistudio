"use client"

import Navbar from "@/components/Navbar"
import { motion, AnimatePresence } from "framer-motion"
import { Play, CheckCircle2, Trophy, ArrowLeft, Star, Clock, User, Share2, Info, Download, FileText, Sparkles, ShoppingCart, Loader2, Lock } from "lucide-react"
import Link from "next/link"
import { useState, useEffect, use } from "react"
import { courses as mockCourses } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { checkEnrollment, enrollFreeCourse } from "@/lib/supabase-helpers"
import { createClient } from "@/lib/supabase/client"
import { defaultBillingSettings, fetchBillingSettings, getActivePlanPrice, hasPremiumAccess, isAdminUser } from "@/lib/membership"
// @ts-ignore
import confetti from "canvas-confetti"

function getYouTubeEmbedUrl(url: string) {
    try {
        const parsedUrl = new URL(url)
        const hostname = parsedUrl.hostname.replace(/^www\./, "")
        let videoId = ""

        if (hostname === "youtu.be") {
            videoId = parsedUrl.pathname.split("/").filter(Boolean)[0] || ""
        } else if (hostname === "youtube.com" || hostname === "m.youtube.com") {
            if (parsedUrl.pathname === "/watch") {
                videoId = parsedUrl.searchParams.get("v") || ""
            } else {
                const parts = parsedUrl.pathname.split("/").filter(Boolean)
                if (["embed", "shorts", "live"].includes(parts[0])) {
                    videoId = parts[1] || ""
                }
            }
        }

        return videoId ? `https://www.youtube.com/embed/${videoId}` : null
    } catch {
        return null
    }
}

function renderTextWithLinks(text: string) {
    // Supports [Title](https://url) markdown links and bare URLs
    const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s]+)/g)
    return parts.map((part, i) => {
        const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
        const href = mdMatch ? mdMatch[2] : /^https?:\/\//.test(part) ? part : null
        if (!href) return part
        return (
            <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
            >
                {mdMatch ? mdMatch[1] : part}
            </a>
        )
    })
}

function getGoogleDriveEmbedUrl(url: string) {
    try {
        const parsedUrl = new URL(url)
        const hostname = parsedUrl.hostname.replace(/^www\./, "")
        if (hostname !== "drive.google.com") return null
        const pathMatch = parsedUrl.pathname.match(/\/file\/d\/([\w-]+)/)
        if (pathMatch) return `https://drive.google.com/file/d/${pathMatch[1]}/preview`
        const paramMatch = url.match(/[?&]id=([\w-]+)/)
        if (paramMatch) return `https://drive.google.com/file/d/${paramMatch[1]}/preview`
        return null
    } catch {
        return null
    }
}

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const { user, signInWithGoogle } = useAuth()
    const [course, setCourse] = useState<any>(null)
    const [courseLoading, setCourseLoading] = useState(true)
    const [completedChapters, setCompletedChapters] = useState<number[]>([])
    const [activeChapter, setActiveChapter] = useState(1)
    const [showXPAlert, setShowXPAlert] = useState(false)
    const [isEnrolled, setIsEnrolled] = useState(false)
    const [isMember, setIsMember] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [billingSettings, setBillingSettings] = useState(defaultBillingSettings)
    const [enrollLoading, setEnrollLoading] = useState(false)
    const [checkingEnrollment, setCheckingEnrollment] = useState(true)

    // Fetch course + lessons from Supabase
    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient()
                const { data: courseData } = await supabase
                    .from('courses')
                    .select('*')
                    .eq('id', id)
                    .single()
                if (courseData) {
                    const { data: lessonData } = await supabase
                        .from('lessons')
                        .select('*')
                        .eq('course_id', id)
                        .order('order', { ascending: true })
                    const lessons = (lessonData || []).map((l: any, i: number) => ({
                        id: i + 1,
                        title: l.title,
                        duration: l.duration,
                        videoUrl: l.video_url,
                        resources: l.resources || [],
                        description: l.description || '',
                        takeaways: l.takeaways || [],
                    }))
                    setCourse({ ...courseData, lessons })
                } else {
                    // Fallback to mock
                    const mock = mockCourses.find(c => c.id === id) || mockCourses[0]
                    setCourse(mock)
                }
            } catch {
                const mock = mockCourses.find(c => c.id === id) || mockCourses[0]
                setCourse(mock)
            }
            setCourseLoading(false)
        }
        load()
    }, [id])

    const isFree = course?.price === "Free" || course?.price === "$0" || course?.price === 0 || course?.price === "0" || !course?.price
    // Courses are gated behind Pro membership. Trial members (active membership) keep access; everyone else must subscribe.
    const hasCourseAccess = isFree || isEnrolled || isMember || isAdmin
    const progress = course ? (completedChapters.length / (course.chapters || 1)) * 100 : 0
    const activeLesson = course?.lessons?.find((lesson: any) => lesson.id === activeChapter)
    const activeLessonYouTubeUrl = activeLesson?.videoUrl ? getYouTubeEmbedUrl(activeLesson.videoUrl) : null
    const activeLessonDriveUrl = activeLesson?.videoUrl ? getGoogleDriveEmbedUrl(activeLesson.videoUrl) : null

    useEffect(() => {
        if (!course) return
        const check = async () => {
            if (user) {
                const enrolled = await checkEnrollment(course.id)
                const supabase = createClient()
                const [{ data: profile }, nextBillingSettings, nextIsAdmin] = await Promise.all([
                    supabase
                        .from('profiles')
                        .select('membership_status, membership_expires_at')
                        .eq('id', user.id)
                        .single(),
                    fetchBillingSettings(supabase),
                    isAdminUser(supabase, user.id),
                ])
                setBillingSettings(nextBillingSettings)
                setIsAdmin(nextIsAdmin)
                setIsMember(hasPremiumAccess(profile, nextIsAdmin))
                setIsEnrolled(enrolled || isFree)
            }
            setCheckingEnrollment(false)
        }
        check()
    }, [user, course?.id, isFree])

    const handleCompleteChapter = () => {
        if (!completedChapters.includes(activeChapter)) {
            setCompletedChapters([...completedChapters, activeChapter])
            setShowXPAlert(true)
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#C4F52B', '#06b6d4', '#f59e0b']
            })
            setTimeout(() => setShowXPAlert(false), 3000)
        }
    }

    const handleEnroll = async () => {
        if (!user) {
            signInWithGoogle()
            return
        }

        setEnrollLoading(true)

        if (isFree) {
            const success = await enrollFreeCourse(course.id)
            if (success) {
                setIsEnrolled(true)
                confetti({ particleCount: 50, spread: 60 })
            }
        } else {
            window.location.href = '/billing'
        }

        setEnrollLoading(false)
    }

    const activePlanPrice = getActivePlanPrice(billingSettings)

    if (courseLoading || !course) {
        return (
            <main className="min-h-screen pb-20">
                <Navbar />
                <div className="pt-32 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            <section className="pt-24 px-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/courses" className="p-2 glass rounded-full hover:bg-white/10 transition-colors">
                        <ArrowLeft className="w-5 h-5 text-white/60" />
                    </Link>
                    <div className="flex flex-col">
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{course.title}</h1>
                        <p className="text-sm text-white/40 flex items-center gap-2">
                            <User className="w-3.5 h-3.5" /> {course.instructor} • {course.level}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content: Video Player */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="relative aspect-video glass-card rounded-2xl border-white/10 overflow-hidden shadow-2xl bg-black">
                            {!hasCourseAccess && !checkingEnrollment ? (
                                /* Locked overlay for non-enrolled paid courses */
                                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-6 z-10">
                                    <div className="p-6 bg-white/5 rounded-full border border-white/10">
                                        <Lock className="w-12 h-12 text-white/40" />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <h3 className="text-xl font-bold">Membership Required</h3>
                                        <p className="text-white/50 text-sm">Start Pro for ₹{activePlanPrice}/month to unlock paid courses</p>
                                    </div>
                                    <button
                                        onClick={handleEnroll}
                                        disabled={enrollLoading}
                                        className="btn-primary flex items-center gap-2 px-8 py-3 text-lg shadow-lg shadow-primary/20"
                                    >
                                        {enrollLoading ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <ShoppingCart className="w-5 h-5" />
                                        )}
                                        {enrollLoading ? 'Processing...' : `Start Pro ₹${activePlanPrice}/mo`}
                                    </button>
                                </div>
                            ) : activeLessonYouTubeUrl ? (
                                <iframe
                                    key={activeLessonYouTubeUrl}
                                    src={activeLessonYouTubeUrl}
                                    title={activeLesson?.title || "Course lesson video"}
                                    className="w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            ) : activeLessonDriveUrl ? (
                                <iframe
                                    key={activeLessonDriveUrl}
                                    src={activeLessonDriveUrl}
                                    title={activeLesson?.title || "Course lesson video"}
                                    className="w-full h-full"
                                    allow="autoplay"
                                    allowFullScreen
                                />
                            ) : activeLesson?.videoUrl ? (
                                <video
                                    key={activeLesson.videoUrl}
                                    src={activeLesson.videoUrl}
                                    controls
                                    controlsList="nodownload noplaybackrate"
                                    disablePictureInPicture
                                    onContextMenu={(e) => e.preventDefault()}
                                    className="w-full h-full"
                                    onEnded={handleCompleteChapter}
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/40">
                                    <Play className="w-16 h-16" />
                                    <p className="text-sm">No video available for this lesson</p>
                                </div>
                            )}
                            <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex items-center justify-between">
                                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium">
                                    Chapter {activeChapter}: {activeLesson?.title || "Lesson"}
                                </div>
                                <div className="bg-primary px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse">
                                    EARN +150 XP
                                </div>
                            </div>
                        </div>

                        {/* Enrollment CTA for non-enrolled users */}
                        {!hasCourseAccess && !checkingEnrollment && (
                            <div className="glass-card p-6 rounded-2xl border border-primary/20 bg-primary/5 flex items-center justify-between">
                                <div className="space-y-1">
                                    <h3 className="font-bold text-lg">Get Full Access with Pro</h3>
                                    <p className="text-sm text-white/50">₹{activePlanPrice}/month • paid courses • 10 portfolio videos</p>
                                </div>
                                <button
                                    onClick={handleEnroll}
                                    disabled={enrollLoading}
                                    className="btn-primary flex items-center gap-2 px-6 py-3 shrink-0"
                                >
                                    {enrollLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : isFree ? (
                                        <Play className="w-4 h-4" />
                                    ) : (
                                        <ShoppingCart className="w-4 h-4" />
                                    )}
                                    {enrollLoading ? 'Processing...' : `Start Pro`}
                                </button>
                            </div>
                        )}

                        <div className="glass-card p-8 rounded-2xl border-white/10">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-400/10 rounded-lg">
                                        <Trophy className="w-5 h-5 text-amber-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold">Your Progress</h3>
                                        <p className="text-xs text-white/40">{completedChapters.length} / {course.chapters} Chapters Completed</p>
                                    </div>
                                </div>
                                <div className={cn(
                                    "px-6 py-2.5 rounded-xl font-bold text-sm",
                                    completedChapters.includes(activeChapter)
                                        ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                                        : "bg-white/5 text-white/40 border border-white/10"
                                )}>
                                    {completedChapters.includes(activeChapter) ? "✓ Chapter Completed" : "Watch full video to complete"}
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden mb-8">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="absolute inset-0 bg-gradient-to-r from-primary to-lime-300"
                                />
                            </div>

                            {(activeLesson?.description || activeLesson?.takeaways?.length > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/5">
                                {activeLesson?.description && (
                                <div className="space-y-4">
                                    <h4 className="flex items-center gap-2 font-bold text-white/90">
                                        <Info className="w-4 h-4 text-primary" /> About this Lesson
                                    </h4>
                                    <p className="text-sm text-white/60 leading-relaxed">
                                        {renderTextWithLinks(activeLesson.description)}
                                    </p>
                                </div>
                                )}
                                {activeLesson?.takeaways?.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="flex items-center gap-2 font-bold text-white/90">
                                        <Star className="w-4 h-4 text-amber-400" /> Key Takeaways
                                    </h4>
                                    <ul className="text-sm text-white/60 space-y-2">
                                        {activeLesson.takeaways.map((t: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> <span>{renderTextWithLinks(t)}</span></li>
                                        ))}
                                    </ul>
                                </div>
                                )}
                            </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar: Chapters */}
                    <div className="glass-card rounded-2xl border-white/10 flex flex-col h-fit sticky top-24 max-h-[calc(100vh-120px)] overflow-hidden">
                        <div className="p-6 border-b border-white/5">
                            <h3 className="font-bold flex items-center gap-2">
                                <Play className="w-4 h-4 text-primary" /> Course Content
                            </h3>
                        </div>
                        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
                            {(course.lessons || Array.from({ length: course.chapters }, (_, i) => ({ id: i + 1, title: "Lesson Detail", duration: "10:00" }))).map((lesson: any) => (
                                <button
                                    key={lesson.id}
                                    onClick={() => setActiveChapter(lesson.id)}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl mb-2 transition-all flex items-center justify-between group",
                                        activeChapter === lesson.id ? "bg-primary/10 border border-primary/20" : "hover:bg-white/5"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={cn(
                                            "flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold",
                                            completedChapters.includes(lesson.id) ? "bg-emerald-500 text-white" : "bg-white/10 text-white/40"
                                        )}>
                                            {completedChapters.includes(lesson.id) ? <CheckCircle2 className="w-4 h-4" /> : lesson.id}
                                        </span>
                                        <span className={cn(
                                            "text-sm font-medium",
                                            activeChapter === lesson.id ? "text-white" : "text-white/40"
                                        )}>
                                            {lesson.title}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {lesson.resources && lesson.resources.length > 0 && <FileText className="w-3 h-3 text-primary/60" />}
                                        <Clock className="w-3.5 h-3.5 text-white/20" />
                                    </div>
                                </button>
                            ))}
                        </div>

                        {progress === 100 && (
                            <Link
                                href={`/courses/${course.id}/certificate`}
                                className="m-4 p-4 bg-gradient-to-r from-amber-400 to-amber-600 rounded-xl text-center font-bold text-black hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                            >
                                <AwardIcon className="w-5 h-5" /> Get Certificate
                            </Link>
                        )}
                    </div>
                </div>
            </section>

            {/* XP Floating Notification */}
            <AnimatePresence>
                {showXPAlert && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5, y: 50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.5, y: 50 }}
                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-primary px-8 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20"
                    >
                        <div className="p-1.5 bg-white/20 rounded-full">
                            <Sparkles className="w-5 h-5 text-white animate-bounce" />
                        </div>
                        <span className="font-bold text-white uppercase tracking-widest text-sm">Level Up! +150 XP Earned</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    )
}

function AwardIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" />
            <circle cx="12" cy="8" r="6" />
        </svg>
    )
}
