"use client"

import Navbar from "@/components/Navbar"
import { motion, AnimatePresence } from "framer-motion"
import {
    Users, Play, ShieldAlert, Ban, CheckCircle2,
    Search, Filter, MoreVertical, TrendingUp,
    ArrowUpRight, LayoutDashboard, BookOpen,
    Tv, Settings, LogOut, Plus, Edit2, Trash2,
    Save, X, Download, FileText, Video, Trophy,
    Inbox, Mail, Clock, DollarSign
} from "lucide-react"
import { courses, adminShowcase, challenges } from "@/lib/data"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import type { Challenge, Course, CourseLesson, ShowcaseItem } from "@/lib/data"
import {
    fetchServiceRequests,
    getServiceRequestClient,
    updateServiceRequestStatus,
    type ServiceRequest,
    type ServiceRequestStatus,
} from "@/lib/service-requests"

const data = [
    { name: 'Mon', joins: 4 },
    { name: 'Tue', joins: 7 },
    { name: 'Wed', joins: 5 },
    { name: 'Thu', joins: 12 },
    { name: 'Fri', joins: 9 },
    { name: 'Sat', joins: 15 },
    { name: 'Sun', joins: 11 },
]

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState("overview")
    const [isChartReady, setIsChartReady] = useState(false)
    const [mockCourses, setMockCourses] = useState<Course[]>(courses)
    const [mockShowcase, setMockShowcase] = useState<ShowcaseItem[]>(adminShowcase)
    const [mockChallenges, setMockChallenges] = useState<Challenge[]>(challenges)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingChaptersId, setEditingChaptersId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<Course | null>(null)
    const [editingShowcaseId, setEditingShowcaseId] = useState<string | null>(null)
    const [showcaseEditForm, setShowcaseEditForm] = useState<ShowcaseItem | null>(null)
    const [editingChallengeId, setEditingChallengeId] = useState<string | null>(null)
    const [challengeEditForm, setChallengeEditForm] = useState<Challenge | null>(null)
    const [viewingSubmissionsId, setViewingSubmissionsId] = useState<string | null>(null)
    const [watchingSubmissionId, setWatchingSubmissionId] = useState<string | null>(null)
    const [watchingChallengeId, setWatchingChallengeId] = useState<string | null>(null)
    const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([])
    const [serviceRequestsMessage, setServiceRequestsMessage] = useState("")
    const [isLoadingServiceRequests, setIsLoadingServiceRequests] = useState(false)

    const editingCourseForChapters = mockCourses.find(c => c.id === editingChaptersId)

    const handleEditCourse = (course: Course) => {
        setEditingId(course.id)
        setEditForm({ ...course })
    }

    const handleSaveCourse = () => {
        if (!editForm) {
            return
        }
        setMockCourses(mockCourses.map(c => c.id === editingId ? editForm : c))
        setEditingId(null)
    }

    const handleAddCourse = () => {
        const newCourse = {
            id: `course-${Date.now()}`,
            title: "New AI Course",
            description: "Enter course description here...",
            thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
            xp: 1000,
            duration: "0 Hours",
            level: "Beginner",
            chapters: 0,
            instructor: "Admin",
            price: "Free",
            lessons: []
        }
        setMockCourses([newCourse, ...mockCourses])
        handleEditCourse(newCourse)
    }

    const handleDeleteCourse = (id: string) => {
        if (confirm("Are you sure you want to delete this course?")) {
            setMockCourses(mockCourses.filter(c => c.id !== id))
        }
    }

    const handleAddShowcase = () => {
        const newItem = {
            id: `showcase-${Date.now()}`,
            title: "New Showcase Video",
            description: "Describe this featured work...",
            thumbnail: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&q=80&w=800",
            videoUrl: "#"
        }
        setMockShowcase([newItem, ...mockShowcase])
        handleEditShowcase(newItem)
    }

    const handleEditShowcase = (item: ShowcaseItem) => {
        setEditingShowcaseId(item.id)
        setShowcaseEditForm({ ...item })
    }

    const handleSaveShowcase = () => {
        if (!showcaseEditForm) {
            return
        }
        setMockShowcase(mockShowcase.map(s => s.id === editingShowcaseId ? showcaseEditForm : s))
        setEditingShowcaseId(null)
    }

    const handleDeleteShowcase = (id: string) => {
        if (confirm("Are you sure you want to remove this from showcase?")) {
            setMockShowcase(mockShowcase.filter(s => s.id !== id))
        }
    }

    const handleUpdateChapters = (courseId: string, updatedLessons: CourseLesson[]) => {
        setMockCourses(mockCourses.map(c =>
            c.id === courseId ? { ...c, lessons: updatedLessons, chapters: updatedLessons.length } : c
        ))
    }

    const handleEditChallenge = (challenge: Challenge) => {
        setEditingChallengeId(challenge.id)
        setChallengeEditForm({ ...challenge })
    }

    const handleSaveChallenge = () => {
        if (!challengeEditForm) {
            return
        }
        setMockChallenges(mockChallenges.map(c => c.id === editingChallengeId ? challengeEditForm : c))
        setEditingChallengeId(null)
    }

    const handleDeleteChallenge = (id: string) => {
        if (confirm("Are you sure you want to delete this challenge?")) {
            setMockChallenges(mockChallenges.filter(c => c.id !== id))
        }
    }

    const handleAddChallenge = () => {
        const newChallenge = {
            id: `challenge-${Date.now()}`,
            title: "New AI Challenge",
            description: "Describe the challenge requirements...",
            prize: "$500",
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            participants: 0,
            difficulty: "Medium",
            winnerId: null,
            submissions: []
        }
        setMockChallenges([newChallenge, ...mockChallenges])
        handleEditChallenge(newChallenge)
    }

    const handleSelectWinner = (challengeId: string, submissionId: string) => {
        setMockChallenges(mockChallenges.map(c =>
            c.id === challengeId ? { ...c, winnerId: submissionId } : c
        ))
        // Auto-close submissions view after picking winner
        setViewingSubmissionsId(null)
    }

    const loadServiceRequests = async () => {
        setIsLoadingServiceRequests(true)
        setServiceRequestsMessage("")

        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) {
                setServiceRequestsMessage("Supabase is not configured yet.")
                return
            }

            setServiceRequests(await fetchServiceRequests(supabase))
        } catch (error) {
            setServiceRequestsMessage("Run supabase-service-requests.sql to enable service request storage.")
        } finally {
            setIsLoadingServiceRequests(false)
        }
    }

    const handleServiceStatusChange = async (id: string, status: ServiceRequestStatus) => {
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return

            const updatedRequest = await updateServiceRequestStatus(supabase, id, status)
            setServiceRequests(currentRequests =>
                currentRequests.map(request => request.id === id ? updatedRequest : request)
            )
        } catch (error) {
            setServiceRequestsMessage("Could not update request status.")
        }
    }

    useEffect(() => {
        setIsChartReady(true)
        loadServiceRequests()
    }, [])

    return (
        <main className="min-h-screen pb-20 bg-[#0a0a0f]">
            <Navbar />

            <div className="pt-24 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                {/* Sidebar Navigation */}
                <aside className="lg:w-64 space-y-2">
                    <div className="glass-card p-4 rounded-2xl border-white/10">
                        <nav className="space-y-1">
                            <button
                                onClick={() => setActiveTab("overview")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "overview" ? "bg-primary text-white" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <LayoutDashboard className="w-4 h-4" /> Dashboard
                            </button>
                            <button
                                onClick={() => setActiveTab("courses")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "courses" ? "bg-primary text-white" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <BookOpen className="w-4 h-4" /> Manage Courses
                            </button>
                            <button
                                onClick={() => setActiveTab("showcase")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "showcase" ? "bg-primary text-white" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Tv className="w-4 h-4" /> Showcase Manager
                            </button>
                            <button
                                onClick={() => setActiveTab("challenges")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "challenges" ? "bg-primary text-white" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Trophy className="w-4 h-4" /> Challenges
                            </button>
                            <button
                                onClick={() => setActiveTab("service-requests")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "service-requests" ? "bg-primary text-white" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Inbox className="w-4 h-4" /> Service Requests
                            </button>
                            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white">
                                <Users className="w-4 h-4" /> Students
                            </button>
                            <div className="pt-4 mt-4 border-t border-white/5">
                                <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-red-400 hover:bg-red-400/5">
                                    <LogOut className="w-4 h-4" /> Sign Out
                                </button>
                            </div>
                        </nav>
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-grow">
                    <AnimatePresence mode="wait">
                        {activeTab === "overview" && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <header>
                                    <h1 className="text-3xl font-bold tracking-tight mb-2">Platform Overview</h1>
                                    <p className="text-white/40 text-sm">Real-time performance and analytics for your AI Academy.</p>
                                </header>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <StatCard label="Total Students" value="1,284" change="+12%" icon={Users} color="text-violet-400" />
                                    <StatCard label="Course Completion" value="68%" change="+5%" icon={CheckCircle2} color="text-emerald-400" />
                                    <StatCard label="Active Challenges" value="4" change="Stable" icon={Play} color="text-amber-400" />
                                    <StatCard label="Reports/Flagged" value="12" change="-2" icon={ShieldAlert} color="text-red-400" />
                                </div>

                                {/* Charts */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="glass-card p-6 rounded-2xl border-white/10">
                                        <h3 className="font-bold mb-6">Student Growth</h3>
                                        <div className="h-[250px] w-full">
                                            {isChartReady ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={data}>
                                                        <defs>
                                                            <linearGradient id="colorJoins" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                                                                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                                        <XAxis dataKey="name" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                                                        <Tooltip
                                                            contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                                            itemStyle={{ color: '#fff' }}
                                                        />
                                                        <Area type="monotone" dataKey="joins" stroke="#7c3aed" fillOpacity={1} fill="url(#colorJoins)" strokeWidth={3} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div className="h-full w-full rounded-2xl border border-white/5 bg-white/[0.02]" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="glass-card p-6 rounded-2xl border-white/10">
                                        <h3 className="font-bold mb-6">Recent Reports</h3>
                                        <div className="space-y-4">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-red-400/10 flex items-center justify-center">
                                                            <Ban className="w-4 h-4 text-red-400" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-white/90 truncate max-w-[150px]">Illicit Content Flag</p>
                                                            <p className="text-[10px] text-white/30">User ID: #5821 • 2 hours ago</p>
                                                        </div>
                                                    </div>
                                                    <button className="text-[10px] font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20 hover:bg-red-400/20 transition-all uppercase tracking-wider">
                                                        Ban Student
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "courses" && (
                            <motion.div
                                key="courses"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                {editingChaptersId ? (
                                    <ChapterEditor
                                        course={editingCourseForChapters}
                                        onBack={() => setEditingChaptersId(null)}
                                        onUpdate={(lessons: CourseLesson[]) => handleUpdateChapters(editingChaptersId, lessons)}
                                    />
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <header>
                                                <h1 className="text-3xl font-bold tracking-tight mb-2">Manage Courses</h1>
                                                <p className="text-white/40 text-sm">Update your curriculum, chapter details, and resources.</p>
                                            </header>
                                            <button
                                                onClick={handleAddCourse}
                                                className="px-5 py-2.5 bg-primary rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                                            >
                                                <Plus className="w-4 h-4" /> Create New
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-6">
                                            {mockCourses.map((course) => (
                                                <div key={course.id} className="glass-card p-6 rounded-2xl border-white/10 flex flex-col md:flex-row gap-6">
                                                    <img src={course.thumbnail} className="w-full md:w-48 aspect-video object-cover rounded-xl" alt="" />
                                                    <div className="flex-grow space-y-4">
                                                        {editingId === course.id ? (
                                                            <div className="space-y-4">
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    <input
                                                                        value={editForm?.title ?? ""}
                                                                        onChange={(e) => setEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)}
                                                                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                                        placeholder="Course Title"
                                                                    />
                                                                    <input
                                                                        value={editForm?.instructor ?? ""}
                                                                        onChange={(e) => setEditForm(prev => prev ? { ...prev, instructor: e.target.value } : prev)}
                                                                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                                        placeholder="Instructor"
                                                                    />
                                                                </div>
                                                                <textarea
                                                                    value={editForm?.description ?? ""}
                                                                    onChange={(e) => setEditForm(prev => prev ? { ...prev, description: e.target.value } : prev)}
                                                                    className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full h-24"
                                                                    placeholder="Description"
                                                                />
                                                                <div className="flex items-center gap-3">
                                                                    <button
                                                                        onClick={handleSaveCourse}
                                                                        className="px-4 py-2 bg-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2"
                                                                    >
                                                                        <Save className="w-3.5 h-3.5" /> Save Changes
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingId(null)}
                                                                        className="px-4 py-2 bg-white/5 rounded-lg text-xs font-bold flex items-center gap-2"
                                                                    >
                                                                        <X className="w-3.5 h-3.5" /> Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div>
                                                                    <h3 className="text-xl font-bold mb-1">{course.title}</h3>
                                                                    <p className="text-sm text-white/40 line-clamp-2">{course.description}</p>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold tracking-widest uppercase text-white/30">
                                                                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> 452 Enrolled</span>
                                                                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {course.chapters} Chapters</span>
                                                                    <span className="flex items-center gap-1 text-primary"><FileText className="w-3 h-3 " /> {course.lessons?.length || 0} Lessons with resources</span>
                                                                </div>
                                                                <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                                                                    <button onClick={() => handleEditCourse(course)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteCourse(course.id)}
                                                                        className="p-2 bg-white/5 rounded-lg hover:bg-red-500/10 text-white/60 hover:text-red-400 transition-colors"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingChaptersId(course.id)}
                                                                        className="ml-auto text-xs font-bold text-primary flex items-center gap-2 hover:translate-x-1 transition-transform"
                                                                    >
                                                                        Edit Chapter Details <ArrowUpRight className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        )}

                        {activeTab === "showcase" && (
                            <motion.div
                                key="showcase"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <header>
                                        <h1 className="text-3xl font-bold tracking-tight mb-2">Showcase Manager</h1>
                                        <p className="text-white/40 text-sm">Curate the videos displayed in the "Our Featured Work" section on the homepage.</p>
                                    </header>
                                    <button
                                        onClick={handleAddShowcase}
                                        className="px-5 py-2.5 bg-primary rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                                    >
                                        <Plus className="w-4 h-4" /> Add Showcase
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {mockShowcase.map((item) => (
                                        <div key={item.id} className="glass-card overflow-hidden group">
                                            {editingShowcaseId === item.id ? (
                                                <div className="p-6 space-y-4">
                                                    <div className="space-y-4">
                                                        <input
                                                            value={showcaseEditForm?.title ?? ""}
                                                            onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)}
                                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                            placeholder="Video Title"
                                                        />
                                                        <textarea
                                                            value={showcaseEditForm?.description ?? ""}
                                                            onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, description: e.target.value } : prev)}
                                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full h-24"
                                                            placeholder="Short Description"
                                                        />
                                                        <input
                                                            value={showcaseEditForm?.thumbnail ?? ""}
                                                            onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, thumbnail: e.target.value } : prev)}
                                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                            placeholder="Thumbnail URL"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={handleSaveShowcase}
                                                            className="px-4 py-2 bg-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2"
                                                        >
                                                            <Save className="w-3.5 h-3.5" /> Save Changes
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingShowcaseId(null)}
                                                            className="px-4 py-2 bg-white/5 rounded-lg text-xs font-bold flex items-center gap-2"
                                                        >
                                                            <X className="w-3.5 h-3.5" /> Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative aspect-video">
                                                        <img src={item.thumbnail} className="w-full h-full object-cover" alt="" />
                                                        <div className="absolute top-4 right-4 flex gap-2">
                                                            <button
                                                                onClick={() => handleEditShowcase(item)}
                                                                className="p-2 glass bg-black/60 backdrop-blur-md rounded-lg hover:bg-primary transition-colors"
                                                            >
                                                                <Edit2 className="w-4 h-4 text-white" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteShowcase(item.id)}
                                                                className="p-2 glass bg-black/60 backdrop-blur-md rounded-lg hover:bg-red-500 transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4 text-white" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="p-6">
                                                        <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                                                        <p className="text-sm text-white/40 leading-relaxed mb-4">{item.description}</p>
                                                        <div className="flex items-center gap-4 py-3 border-t border-white/5">
                                                            <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                                <Save className="w-3 h-3 text-emerald-400" /> Published to Homepage
                                                            </div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                        {activeTab === "challenges" && (
                            <motion.div
                                key="challenges"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <header>
                                        <h1 className="text-3xl font-bold tracking-tight mb-2">Challenge Management</h1>
                                        <p className="text-white/40 text-sm">Create challenges, view student submissions, and pick winners.</p>
                                    </header>
                                    <button
                                        onClick={handleAddChallenge}
                                        className="px-5 py-2.5 bg-primary rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                                    >
                                        <Plus className="w-4 h-4" /> New Challenge
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-6">
                                    {mockChallenges.map((challenge) => (
                                        <div key={challenge.id} className="glass-card p-6 rounded-2xl border-white/10 space-y-6">
                                            {editingChallengeId === challenge.id ? (
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <input
                                                            value={challengeEditForm?.title ?? ""}
                                                            onChange={(e) => setChallengeEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)}
                                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                            placeholder="Challenge Title"
                                                        />
                                                        <input
                                                            value={challengeEditForm?.prize ?? ""}
                                                            onChange={(e) => setChallengeEditForm(prev => prev ? { ...prev, prize: e.target.value } : prev)}
                                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                            placeholder="Prize Amount"
                                                        />
                                                    </div>
                                                    <textarea
                                                        value={challengeEditForm?.description ?? ""}
                                                        onChange={(e) => setChallengeEditForm(prev => prev ? { ...prev, description: e.target.value } : prev)}
                                                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full h-24"
                                                        placeholder="Requirements & Rules"
                                                    />
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <input
                                                            type="date"
                                                            value={challengeEditForm?.deadline ?? ""}
                                                            onChange={(e) => setChallengeEditForm(prev => prev ? { ...prev, deadline: e.target.value } : prev)}
                                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                        />
                                                        <select
                                                            value={challengeEditForm?.difficulty ?? "Medium"}
                                                            onChange={(e) => setChallengeEditForm(prev => prev ? { ...prev, difficulty: e.target.value } : prev)}
                                                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full text-white/60"
                                                        >
                                                            <option value="Beginner">Beginner</option>
                                                            <option value="Medium">Medium</option>
                                                            <option value="Hard">Hard</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={handleSaveChallenge}
                                                            className="px-4 py-2 bg-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2"
                                                        >
                                                            <Save className="w-3.5 h-3.5" /> Save Challenge
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingChallengeId(null)}
                                                            className="px-4 py-2 bg-white/5 rounded-lg text-xs font-bold flex items-center gap-2"
                                                        >
                                                            <X className="w-3.5 h-3.5" /> Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex flex-col md:flex-row justify-between gap-6">
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-3">
                                                                <h3 className="text-xl font-bold">{challenge.title}</h3>
                                                                <span className={cn(
                                                                    "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                                                                    challenge.difficulty === "Hard" ? "bg-red-400/10 text-red-400" :
                                                                        challenge.difficulty === "Medium" ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400"
                                                                )}>
                                                                    {challenge.difficulty}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-white/40 max-w-2xl">{challenge.description}</p>
                                                            <div className="flex items-center gap-6 pt-2">
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] text-white/20 uppercase font-bold tracking-widest">Prize Fund</p>
                                                                    <p className="text-emerald-400 font-bold">{challenge.prize}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] text-white/20 uppercase font-bold tracking-widest">Deadline</p>
                                                                    <p className="text-white/80 font-bold text-sm">{challenge.deadline}</p>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] text-white/20 uppercase font-bold tracking-widest">Participants</p>
                                                                    <p className="text-white/80 font-bold text-sm">{challenge.participants}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-2 shrink-0">
                                                            <button
                                                                onClick={() => setViewingSubmissionsId(viewingSubmissionsId === challenge.id ? null : challenge.id)}
                                                                className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                                                            >
                                                                <Users className="w-3.5 h-3.5" /> {viewingSubmissionsId === challenge.id ? "Close Submissions" : "View Submissions"}
                                                            </button>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => handleEditChallenge(challenge)} className="flex-grow p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/60 flex items-center justify-center">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => handleDeleteChallenge(challenge.id)} className="flex-grow p-2 bg-white/5 rounded-lg hover:bg-red-500/10 text-white/60 hover:text-red-400">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {viewingSubmissionsId === challenge.id && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            className="pt-6 border-t border-white/5"
                                                        >
                                                            <h4 className="text-xs font-bold text-white/20 uppercase tracking-widest mb-4">Student Submissions</h4>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                                {challenge.submissions.map((sub: any) => (
                                                                    <div key={sub.id} className={cn(
                                                                        "p-3 rounded-xl border transition-all relative group/sub",
                                                                        challenge.winnerId === sub.id ? "bg-primary/10 border-primary" : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                                                    )}>
                                                                        {challenge.winnerId === sub.id && (
                                                                            <div className="absolute -top-2 -right-2 bg-primary text-white p-1 rounded-full shadow-lg z-10">
                                                                                <Trophy className="w-3 h-3" />
                                                                            </div>
                                                                        )}
                                                                        <div className="flex gap-3">
                                                                            <div className="relative group/thumb w-16 aspect-video shrink-0">
                                                                                <img src={sub.thumbnail} className="w-full h-full object-cover rounded-lg" alt="" />
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setWatchingSubmissionId(sub.id)
                                                                                        setWatchingChallengeId(challenge.id)
                                                                                    }}
                                                                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
                                                                                >
                                                                                    <Play className="w-5 h-5 text-white fill-white" />
                                                                                </button>
                                                                            </div>
                                                                            <div className="flex-grow overflow-hidden">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <p className="text-sm font-bold truncate">{sub.studentName}</p>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setWatchingSubmissionId(sub.id)
                                                                                            setWatchingChallengeId(challenge.id)
                                                                                        }}
                                                                                        className="p-1 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-colors"
                                                                                        title="Watch Submission"
                                                                                    >
                                                                                        <Play className="w-3 h-3" />
                                                                                    </button>
                                                                                </div>
                                                                                <p className="text-[10px] text-white/40">{sub.timestamp}</p>
                                                                                <button
                                                                                    onClick={() => handleSelectWinner(challenge.id, sub.id)}
                                                                                    className={cn(
                                                                                        "mt-2 w-full py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                                                                        challenge.winnerId === sub.id ? "bg-primary text-white" : "bg-white/5 text-white/40 hover:bg-primary hover:text-white"
                                                                                    )}
                                                                                >
                                                                                    {challenge.winnerId === sub.id ? "Winner Selected" : "Choose Winner"}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "service-requests" && (
                            <motion.div
                                key="service-requests"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <header>
                                        <h1 className="text-3xl font-bold tracking-tight mb-2">Service Requests</h1>
                                        <p className="text-white/40 text-sm">Requests submitted from the AI Services project form.</p>
                                    </header>
                                    <button
                                        onClick={loadServiceRequests}
                                        className="px-5 py-2.5 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-white/20 transition-colors"
                                    >
                                        <Download className="w-4 h-4" /> Refresh
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <StatCard label="New Requests" value={String(serviceRequests.filter(request => request.status === "new").length)} change="Live" icon={Inbox} color="text-cyan-400" />
                                    <StatCard label="Contacted" value={String(serviceRequests.filter(request => request.status === "contacted").length)} change="Live" icon={Mail} color="text-amber-400" />
                                    <StatCard label="Closed" value={String(serviceRequests.filter(request => request.status === "closed").length)} change="Live" icon={CheckCircle2} color="text-emerald-400" />
                                </div>

                                {serviceRequestsMessage && (
                                    <div className="glass-card p-4 text-sm text-white/50 border-white/10">
                                        {serviceRequestsMessage}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    {isLoadingServiceRequests ? (
                                        <div className="glass-card p-8 text-center text-white/40">Loading requests...</div>
                                    ) : serviceRequests.length === 0 ? (
                                        <div className="glass-card p-12 text-center">
                                            <Inbox className="w-12 h-12 text-white/20 mx-auto mb-4" />
                                            <h2 className="text-2xl font-bold mb-2">No Requests Yet</h2>
                                            <p className="text-white/40">New AI Services submissions will appear here.</p>
                                        </div>
                                    ) : (
                                        serviceRequests.map((request) => (
                                            <article key={request.id} className="glass-card p-6 rounded-2xl border-white/10 space-y-5">
                                                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <h3 className="text-xl font-bold">{request.fullName}</h3>
                                                            <span className={cn(
                                                                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                                                                request.status === "new" ? "bg-cyan-400/10 text-cyan-300" :
                                                                    request.status === "contacted" ? "bg-amber-400/10 text-amber-300" : "bg-emerald-400/10 text-emerald-300"
                                                            )}>
                                                                {request.status}
                                                            </span>
                                                        </div>
                                                        <a href={`mailto:${request.email}`} className="text-sm text-primary hover:underline flex items-center gap-2">
                                                            <Mail className="w-4 h-4" /> {request.email}
                                                        </a>
                                                        <p className="text-xs text-white/30">
                                                            Submitted {new Date(request.createdAt).toLocaleString()}
                                                        </p>
                                                    </div>

                                                    <select
                                                        value={request.status}
                                                        onChange={(event) => handleServiceStatusChange(request.id, event.target.value as ServiceRequestStatus)}
                                                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white/70 outline-none focus:border-primary"
                                                    >
                                                        <option value="new" className="bg-[#1a1a2e]">New</option>
                                                        <option value="contacted" className="bg-[#1a1a2e]">Contacted</option>
                                                        <option value="closed" className="bg-[#1a1a2e]">Closed</option>
                                                    </select>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Service</p>
                                                        <p className="font-bold">{request.serviceType}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                            <DollarSign className="w-3 h-3" /> Budget
                                                        </p>
                                                        <p className="font-bold">{request.budgetRange || "Not specified"}</p>
                                                    </div>
                                                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                            <Clock className="w-3 h-3" /> Timeline
                                                        </p>
                                                        <p className="font-bold">{request.timeline || "Not specified"}</p>
                                                    </div>
                                                </div>

                                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Project Description</p>
                                                    <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{request.projectDescription}</p>
                                                </div>
                                            </article>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Submission Video Player Modal */}
                    <AnimatePresence>
                        {watchingSubmissionId && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-sm"
                                onClick={() => setWatchingSubmissionId(null)}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="bg-[#12121a] rounded-3xl border border-white/10 overflow-hidden w-full max-w-4xl shadow-2xl"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-bold">
                                                {mockChallenges.find(c => c.id === watchingChallengeId)?.submissions.find(s => s.id === watchingSubmissionId)?.studentName}'s Submission
                                            </h3>
                                            <p className="text-xs text-white/40">Watching student creation for {mockChallenges.find(c => c.id === watchingChallengeId)?.title}</p>
                                        </div>
                                        <button
                                            onClick={() => setWatchingSubmissionId(null)}
                                            className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all"
                                        >
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>
                                    <div className="aspect-video bg-black flex items-center justify-center border-b border-white/5">
                                        <video
                                            src={mockChallenges.find(c => c.id === watchingChallengeId)?.submissions.find(s => s.id === watchingSubmissionId)?.videoUrl}
                                            controls
                                            autoPlay
                                            className="w-full h-full"
                                        />
                                    </div>
                                    <div className="p-4 flex items-center justify-between bg-white/[0.02]">
                                        <div className="flex items-center gap-4 text-xs font-bold text-white/40 uppercase tracking-widest">
                                            <span>Student: {mockChallenges.find(c => c.id === watchingChallengeId)?.submissions.find(s => s.id === watchingSubmissionId)?.studentName}</span>
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                            <span>Submitted: {mockChallenges.find(c => c.id === watchingChallengeId)?.submissions.find(s => s.id === watchingSubmissionId)?.timestamp}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (watchingChallengeId && watchingSubmissionId) {
                                                    handleSelectWinner(watchingChallengeId, watchingSubmissionId)
                                                    setWatchingSubmissionId(null)
                                                }
                                            }}
                                            className="px-4 py-2 bg-primary rounded-xl text-xs font-bold flex items-center gap-2 hover:scale-105 transition-transform"
                                        >
                                            <Trophy className="w-4 h-4" /> Pick as Winner
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </main>
    )
}

function ChapterEditor({ course, onBack, onUpdate }: any) {
    const [lessons, setLessons] = useState(course?.lessons || [])

    const handleAddLesson = () => {
        const newLesson = {
            id: lessons.length + 1,
            title: "New Lesson",
            duration: "10:00",
            videoUrl: "",
            resources: []
        }
        setLessons([...lessons, newLesson])
    }

    const handleDeleteLesson = (id: number) => {
        setLessons(lessons.filter((l: any) => l.id !== id))
    }

    const handleUpdateLesson = (id: number, field: string, value: any) => {
        setLessons(lessons.map((l: any) => l.id === id ? { ...l, [field]: value } : l))
    }

    const handleAddResource = (lessonId: number) => {
        setLessons(lessons.map((l: any) => {
            if (l.id === lessonId) {
                return {
                    ...l,
                    resources: [...l.resources, { name: "New Resource.pdf", url: "#" }]
                }
            }
            return l
        }))
    }

    const handleDeleteResource = (lessonId: number, resourceIndex: number) => {
        setLessons(lessons.map((l: any) => {
            if (l.id === lessonId) {
                const newResources = [...l.resources]
                newResources.splice(resourceIndex, 1)
                return { ...l, resources: newResources }
            }
            return l
        }))
    }

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                <Plus className="w-4 h-4 rotate-45" /> Back to Courses
            </button>
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Curriculum: {course?.title}</h2>
                <button
                    onClick={() => {
                        onUpdate(lessons)
                        onBack()
                    }}
                    className="px-4 py-2 bg-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2"
                >
                    <Save className="w-4 h-4" /> Finalize Changes
                </button>
            </div>

            <div className="space-y-4">
                {lessons.map((lesson: any, index: number) => (
                    <div key={lesson.id} className="glass-card p-6 rounded-2xl border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-grow">
                                <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-white/40">{index + 1}</span>
                                <div className="flex-grow space-y-2">
                                    <input
                                        value={lesson.title}
                                        onChange={(e) => handleUpdateLesson(lesson.id, "title", e.target.value)}
                                        className="bg-transparent border-none text-lg font-bold focus:outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1 w-full"
                                        placeholder="Lesson Title"
                                    />
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex-grow flex items-center gap-2">
                                            <div className="relative flex-grow">
                                                <Play className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                                                <input
                                                    value={lesson.videoUrl || ""}
                                                    onChange={(e) => handleUpdateLesson(lesson.id, "videoUrl", e.target.value)}
                                                    className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-1.5 text-[10px] focus:outline-none focus:border-primary w-full"
                                                    placeholder="Video URL (YouTube/Vimeo)"
                                                />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] font-bold text-white/10 uppercase">or</span>
                                                <label className="cursor-pointer group/upload">
                                                    <input
                                                        type="file"
                                                        accept="video/*"
                                                        className="hidden"
                                                        onChange={(e: any) => {
                                                            const file = e.target.files?.[0]
                                                            if (file) {
                                                                handleUpdateLesson(lesson.id, "videoUrl", `Local: ${file.name} (uploaded)`)
                                                            }
                                                        }}
                                                    />
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-white/40 group-hover/upload:bg-primary/20 group-hover/upload:text-primary transition-all whitespace-nowrap">
                                                        <Video className="w-3 h-3" /> Upload
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                        <input
                                            value={lesson.duration}
                                            onChange={(e) => handleUpdateLesson(lesson.id, "duration", e.target.value)}
                                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] focus:outline-none focus:border-primary w-20 text-center"
                                            placeholder="Duration"
                                        />
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleDeleteLesson(lesson.id)} className="p-2 text-white/20 hover:text-red-400 transition-colors self-start mt-2">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="pl-12 space-y-3">
                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Downloadable Resources</p>
                            <div className="flex flex-wrap gap-2">
                                {lesson.resources.map((resource: any, rIndex: number) => (
                                    <div key={rIndex} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                                        <FileText className="w-3 h-3 text-primary" />
                                        <input
                                            value={resource.name}
                                            onChange={(e) => {
                                                const newResources = [...lesson.resources]
                                                newResources[rIndex] = { ...resource, name: e.target.value }
                                                handleUpdateLesson(lesson.id, "resources", newResources)
                                            }}
                                            className="bg-transparent border-none text-[10px] font-bold focus:outline-none min-w-[100px]"
                                        />
                                        <button onClick={() => handleDeleteResource(lesson.id, rIndex)} className="text-white/20 hover:text-red-400">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => handleAddResource(lesson.id)}
                                    className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition-all"
                                >
                                    <Plus className="w-3 h-3" /> Add Material
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                <button
                    onClick={handleAddLesson}
                    className="w-full py-4 border-2 border-dashed border-white/5 rounded-2xl flex items-center justify-center gap-2 text-white/20 hover:border-primary/40 hover:text-primary transition-all group"
                >
                    <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" /> Add New Chapter
                </button>
            </div>
        </div>
    )
}

function StatCard({ label, value, change, icon: Icon, color }: any) {
    return (
        <div className="glass-card p-6 rounded-2xl border-white/10 hover:border-white/20 transition-all">
            <div className="flex items-start justify-between mb-4">
                <div className={cn("p-2 rounded-lg bg-white/5", color)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className={cn("text-[10px] font-bold px-2 py-1 rounded-md bg-white/5",
                    change.includes('+') ? "text-emerald-400" : change.includes('-') ? "text-red-400" : "text-white/40")}>
                    {change}
                </div>
            </div>
            <p className="text-white/40 text-xs font-medium mb-1 uppercase tracking-wider">{label}</p>
            <h4 className="text-2xl font-bold">{value}</h4>
        </div>
    )
}
