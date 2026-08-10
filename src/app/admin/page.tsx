"use client"

import Navbar from "@/components/Navbar"
import { motion, AnimatePresence } from "framer-motion"
import {
    Users, Play, ShieldAlert, Ban, CheckCircle2,
    Search, Filter, MoreVertical, TrendingUp,
    ArrowUpRight, LayoutDashboard, BookOpen,
    Tv, Settings, LogOut, Plus, Edit2, Trash2,
    Save, X, Download, FileText, Video, Trophy,
    Inbox, Mail, Clock, DollarSign, Loader2, Phone,
    ChevronLeft, ChevronRight, Calendar, Pause, PauseCircle, PlayCircle
} from "lucide-react"
import { courses, adminShowcase, challenges } from "@/lib/data"
import { useEffect, useState } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { cn } from "@/lib/utils"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import type { Challenge, ChallengeSubmission, Course, CourseLesson, ShowcaseItem } from "@/lib/data"
import {
    fetchServiceRequests,
    getServiceRequestClient,
    updateServiceRequestStatus,
    type ServiceRequest,
    type ServiceRequestStatus,
} from "@/lib/service-requests"
import { defaultBillingSettings, fetchBillingSettings, getActivePlanPrice, type BillingSettings } from "@/lib/membership"
import { defaultDirectorModels, normalizeDirectorModels, type DirectorModelConfig } from "@/lib/studio/ai-models"
import { defaultSiteFeatures, fetchSiteFeatures, fetchStudioFeatureFlags, studioFeatureFlagDefaults, type SiteFeatures, type StudioFeatureFlags } from "@/lib/studio/feature-flags"
import { defaultDirectorWorkflows, fetchDirectorWorkflows, normalizeDirectorWorkflows, type DirectorWorkflowConfig } from "@/lib/studio/workflows"
import { defaultDirectorGlobalInstructions, normalizeDirectorGlobalInstructions } from "@/lib/studio/instructions"
import { defaultDirectorRuntimeSettings, fetchDirectorRuntimeSettings, normalizeDirectorRuntimeSettings, specialistInstructionKeys, type DirectorRuntimeSettings } from "@/lib/studio/director-runtime-settings"
import { defaultDirectorTeam, directorAgentKeys, fetchDirectorTeam, normalizeDirectorTeam, type DirectorTeam } from "@/lib/studio/director-team"
import BlogManager from "@/components/admin/BlogManager"

type EnrolledStudent = {
    profile_id: string
    course_id: string | null
    status: string
    created_at: string
    full_name: string
    email: string
    avatar_url: string
    membership_status?: string | null
    membership_expires_at?: string | null
    is_trial?: boolean | null
    bids?: number | null
}

type AdminStats = {
    totalStudents: number
    totalEnrollments: number
    activeChallenges: number
    courseEnrollments: Record<string, number>
}

const defaultStats: AdminStats = {
    totalStudents: 0,
    totalEnrollments: 0,
    activeChallenges: 0,
    courseEnrollments: {},
}

function ImageOrPlaceholder({ src, alt = "", className }: { src?: string | null; alt?: string; className?: string }) {
    const safeSrc = src?.trim()

    if (safeSrc) {
        return <img src={safeSrc} className={className} alt={alt} />
    }

    return (
        <div className={cn("flex items-center justify-center bg-white/5 text-white/25", className)}>
            <Video className="w-6 h-6" />
        </div>
    )
}

function mapChallengeSubmissionRow(row: any): ChallengeSubmission {
    return {
        id: row.id,
        studentName: row.student_name || "Student",
        videoUrl: row.video_url || "",
        timestamp: row.created_at ? new Date(row.created_at).toLocaleDateString() : "Just now",
        thumbnail: row.thumbnail || "",
    }
}

function AdminGate({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth()
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

    useEffect(() => {
        const checkAdmin = async () => {
            if (!user) { setIsAdmin(false); return }
            try {
                const supabase = await getServiceRequestClient()
                if (!supabase) { setIsAdmin(false); return }
                const { data } = await supabase
                    .from('admin_users')
                    .select('id')
                    .eq('id', user.id)
                    .single()
                setIsAdmin(!!data)
            } catch {
                setIsAdmin(false)
            }
        }
        if (!loading) checkAdmin()
    }, [user, loading])

    if (loading || isAdmin === null) {
        return (
            <main className="min-h-screen pb-20 bg-[#0a0a0f]">
                <Navbar />
                <div className="pt-32 flex items-center justify-center">
                    <div className="glass-card p-12 text-center">
                        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-white/50">Verifying access...</p>
                    </div>
                </div>
            </main>
        )
    }

    if (!isAdmin) {
        return (
            <main className="min-h-screen pb-20 bg-[#0a0a0f]">
                <Navbar />
                <div className="pt-32 flex items-center justify-center">
                    <div className="glass-card p-12 text-center max-w-md">
                        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
                        <p className="text-white/40">This page is restricted to administrators only.</p>
                    </div>
                </div>
            </main>
        )
    }

    return <>{children}</>
}

export default function AdminDashboard() {
    return <AdminGate><AdminDashboardContent /></AdminGate>
}

function AdminDashboardContent() {
    const [activeTab, setActiveTab] = useState("overview")
    const [isChartReady, setIsChartReady] = useState(false)
    const [mockCourses, setMockCourses] = useState<Course[]>(courses)
    const [mockShowcase, setMockShowcase] = useState<ShowcaseItem[]>([])
    const [isLoadingShowcase, setIsLoadingShowcase] = useState(false)
    const [showcaseVideoFile, setShowcaseVideoFile] = useState<File | null>(null)
    const [showcaseThumbnailFile, setShowcaseThumbnailFile] = useState<File | null>(null)
    const [showcaseSaving, setShowcaseSaving] = useState(false)
    const [showcaseMessage, setShowcaseMessage] = useState("")
    const [uploadStatus, setUploadStatus] = useState<string>("")
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
    const [adminStats, setAdminStats] = useState<AdminStats>(defaultStats)
    const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
    const [isLoadingStudents, setIsLoadingStudents] = useState(false)
    const [growthData, setGrowthData] = useState<{ name: string; joins: number }[]>([])
    const [allEnrollments, setAllEnrollments] = useState<any[]>([])
    const [allPayments, setAllPayments] = useState<{ amount: number; created_at: string }[]>([])
    const [analyticsMode, setAnalyticsMode] = useState<'daily' | 'weekly' | 'monthly'>('daily')
    const [analyticsDate, setAnalyticsDate] = useState(new Date())
    const [totalRevenue, setTotalRevenue] = useState(0)
    const [todayRevenue, setTodayRevenue] = useState(0)
    const [billingSettings, setBillingSettings] = useState<BillingSettings>(defaultBillingSettings)
    const [billingMessage, setBillingMessage] = useState("")
    const [isSavingBilling, setIsSavingBilling] = useState(false)
    const [trialSettings, setTrialSettings] = useState({ enabled: true, trialDays: 4, promoEndDate: "2026-07-01" })
    const [isSavingTrial, setIsSavingTrial] = useState(false)
    const [trialMessage, setTrialMessage] = useState("")
    const [directorModels, setDirectorModels] = useState<DirectorModelConfig[]>(defaultDirectorModels.map((model) => ({ ...model })))
    const [isSavingDirectorModels, setIsSavingDirectorModels] = useState(false)
    const [directorModelsMessage, setDirectorModelsMessage] = useState("")
    const [directorWorkflows, setDirectorWorkflows] = useState<DirectorWorkflowConfig[]>(defaultDirectorWorkflows.map((workflow) => ({ ...workflow })))
    const [isSavingDirectorWorkflows, setIsSavingDirectorWorkflows] = useState(false)
    const [directorWorkflowsMessage, setDirectorWorkflowsMessage] = useState("")
    const [directorGlobalInstructions, setDirectorGlobalInstructions] = useState(defaultDirectorGlobalInstructions)
    const [isSavingDirectorGlobalInstructions, setIsSavingDirectorGlobalInstructions] = useState(false)
    const [directorGlobalInstructionsMessage, setDirectorGlobalInstructionsMessage] = useState("")
    const [directorRuntimeSettings, setDirectorRuntimeSettings] = useState<DirectorRuntimeSettings>(() => structuredClone(defaultDirectorRuntimeSettings))
    const [directorTeam, setDirectorTeam] = useState<DirectorTeam>(() => structuredClone(defaultDirectorTeam))
    const [isSavingDirectorTeam, setIsSavingDirectorTeam] = useState(false)
    const [directorTeamMessage, setDirectorTeamMessage] = useState("")
    const [isSavingDirectorRuntimeSettings, setIsSavingDirectorRuntimeSettings] = useState(false)
    const [directorRuntimeSettingsMessage, setDirectorRuntimeSettingsMessage] = useState("")
    const [studioFeatureFlags, setStudioFeatureFlags] = useState<StudioFeatureFlags>({ ...studioFeatureFlagDefaults })
    const [isSavingStudioFeatureFlags, setIsSavingStudioFeatureFlags] = useState(false)
    const [studioFeatureFlagsMessage, setStudioFeatureFlagsMessage] = useState("")
    const [siteFeatures, setSiteFeatures] = useState<SiteFeatures>(defaultSiteFeatures)
    const [isSavingSiteFeatures, setIsSavingSiteFeatures] = useState(false)
    const [siteFeaturesMessage, setSiteFeaturesMessage] = useState("")

    const loadSiteFeatures = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        setSiteFeatures(await fetchSiteFeatures(supabase))
    }

    const handleToggleSiteFeature = (key: keyof SiteFeatures) => {
        setSiteFeatures(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const handleSaveSiteFeatures = async () => {
        setIsSavingSiteFeatures(true)
        setSiteFeaturesMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            
            const { error: rpcErr } = await supabase.rpc('admin_update_site_features', {
                p_features: siteFeatures
            })
            
            if (rpcErr) {
                // Fallback to direct table upsert
                const { error: directErr } = await supabase
                    .from('site_settings')
                    .upsert({ key: 'site_features', value: siteFeatures }, { onConflict: 'key' })
                if (directErr) throw rpcErr
            }
            
            setSiteFeaturesMessage("Feature pause controls saved successfully!")
        } catch (err: any) {
            setSiteFeaturesMessage(`Could not save: ${err.message || 'Unknown error'}`)
        } finally {
            setIsSavingSiteFeatures(false)
        }
    }

    const pricePerEnrollment = getActivePlanPrice(billingSettings)

    const editingCourseForChapters = mockCourses.find(c => c.id === editingChaptersId)

    const handleEditCourse = (course: Course) => {
        setEditingId(course.id)
        setEditForm({ ...course })
    }

    const handleSaveCourse = async () => {
        if (!editForm) return
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const { error } = await supabase.rpc('admin_upsert_course', {
                p_id: editForm.id, p_title: editForm.title, p_description: editForm.description,
                p_thumbnail: editForm.thumbnail, p_xp: editForm.xp, p_duration: editForm.duration,
                p_level: editForm.level, p_chapters: editForm.chapters, p_instructor: editForm.instructor,
                p_price: editForm.price,
            })
            if (error) throw error
            setMockCourses(prev => prev.map(c => c.id === editingId ? editForm : c))
            setEditingId(null)
        } catch (err: any) {
            alert('Failed to save course: ' + (err.message || 'Unknown error'))
        }
    }

    const handleAddCourse = async () => {
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
            lessons: [],
        }
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const { error } = await supabase.rpc('admin_upsert_course', {
                p_id: newCourse.id, p_title: newCourse.title, p_description: newCourse.description,
                p_thumbnail: newCourse.thumbnail, p_xp: newCourse.xp, p_duration: newCourse.duration,
                p_level: newCourse.level, p_chapters: newCourse.chapters, p_instructor: newCourse.instructor,
                p_price: newCourse.price,
            })
            if (error) throw error
            setMockCourses(prev => [newCourse, ...prev])
            handleEditCourse(newCourse)
        } catch (err: any) {
            alert('Failed to add course: ' + (err.message || 'Unknown error'))
        }
    }

    const handleDeleteCourse = async (id: string) => {
        if (!confirm("Are you sure you want to delete this course?")) return
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const { error } = await supabase.rpc('admin_delete_course', { course_id: id })
            if (error) throw error
            setMockCourses(prev => prev.filter(c => c.id !== id))
        } catch (err: any) {
            console.error('Delete course error:', err)
            alert('Failed to delete course: ' + (err.message || 'Unknown error'))
        }
    }

    const handleTogglePauseCourse = async (course: Course) => {
        const nextState = !course.is_paused
        const actionLabel = nextState ? "pause" : "resume"
        if (!confirm(`Are you sure you want to ${actionLabel} "${course.title}"? ${nextState ? "It will stop appearing in the public courses section." : "It will become visible to all students again."}`)) return

        try {
            const supabase = await getServiceRequestClient()
            if (supabase) {
                const { error } = await supabase.from('courses').update({ is_paused: nextState }).eq('id', course.id)
                if (error) throw error
            }
            setMockCourses(prev => prev.map(c => c.id === course.id ? { ...c, is_paused: nextState } : c))
        } catch (err: any) {
            alert(`Could not ${actionLabel} course: ${err.message || 'Unknown error'}`)
        }
    }

    const loadBillingSettings = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        setBillingSettings(await fetchBillingSettings(supabase))
    }

    const handleSaveBillingSettings = async () => {
        setIsSavingBilling(true)
        setBillingMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const { data, error } = await supabase.rpc('admin_update_billing_settings', {
                p_monthly_price: billingSettings.monthlyPrice,
                p_offer_enabled: billingSettings.offerEnabled,
                p_offer_price: billingSettings.offerPrice,
                p_offer_text: billingSettings.offerText,
                p_payments_enabled: billingSettings.paymentsEnabled,
            })
            if (error) throw error
            setBillingSettings({
                planName: data?.plan_name || defaultBillingSettings.planName,
                monthlyPrice: Number(data?.monthly_price || billingSettings.monthlyPrice),
                offerEnabled: Boolean(data?.offer_enabled),
                offerPrice: Number(data?.offer_price || billingSettings.offerPrice),
                offerText: data?.offer_text || billingSettings.offerText,
                paymentsEnabled: data?.payments_enabled !== undefined ? Boolean(data.payments_enabled) : billingSettings.paymentsEnabled,
                razorpayPlanId: data?.razorpay_plan_id || billingSettings.razorpayPlanId,
                offerEndsAt: data?.offer_ends_at || billingSettings.offerEndsAt,
            })
            setBillingMessage("Plan settings saved.")
        } catch (err: any) {
            setBillingMessage(`Could not save settings: ${err.message || 'Unknown error'}`)
        } finally {
            setIsSavingBilling(false)
        }
    }

    const loadTrialSettings = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        const { data } = await supabase.from("site_settings").select("value").eq("key", "free_trial").single()
        if (data?.value) {
            setTrialSettings({
                enabled: Boolean(data.value.enabled),
                trialDays: Number(data.value.trial_days) || 4,
                promoEndDate: data.value.promo_end_date ? data.value.promo_end_date.split("T")[0] : "2026-07-01",
            })
        }
    }

    const handleSaveTrialSettings = async () => {
        setIsSavingTrial(true)
        setTrialMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const { data, error } = await supabase.rpc('admin_update_free_trial', {
                p_enabled: trialSettings.enabled,
                p_trial_days: trialSettings.trialDays,
                p_promo_end_date: trialSettings.promoEndDate + "T23:59:59Z",
            })
            if (error) throw error
            setTrialMessage("Free trial settings saved.")
        } catch (err: any) {
            setTrialMessage(`Could not save: ${err.message || 'Unknown error'}`)
        } finally {
            setIsSavingTrial(false)
        }
    }

    const loadDirectorModels = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        const { data } = await supabase.from("site_settings").select("value").eq("key", "ai_director_models").maybeSingle()
        setDirectorModels(normalizeDirectorModels(data?.value))
    }

    const handleSaveDirectorModels = async () => {
        setIsSavingDirectorModels(true)
        setDirectorModelsMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const { data, error } = await supabase.rpc("admin_update_ai_director_models", {
                p_models: directorModels,
            })
            if (error) throw error
            setDirectorModels(normalizeDirectorModels(data))
            setDirectorModelsMessage("AI Director models saved.")
        } catch (err: any) {
            setDirectorModelsMessage(`Could not save models: ${err.message || "Unknown error"}`)
        } finally {
            setIsSavingDirectorModels(false)
        }
    }

    const setDirectorModelStatus = (id: string, status: "active" | "paused") => {
        setDirectorModels((models) => models.map((model) => model.id === id ? { ...model, status } : model))
    }

    const loadDirectorWorkflows = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        setDirectorWorkflows(await fetchDirectorWorkflows(supabase))
    }

    const loadDirectorGlobalInstructions = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        const { data } = await supabase.from("site_settings").select("value").eq("key", "ai_director_global_instructions").maybeSingle()
        setDirectorGlobalInstructions(normalizeDirectorGlobalInstructions(data?.value))
    }

    const loadDirectorRuntimeSettings = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        setDirectorRuntimeSettings(await fetchDirectorRuntimeSettings(supabase))
        setDirectorTeam(await fetchDirectorTeam(supabase))
    }

    const handleSaveDirectorTeam = async () => {
        setIsSavingDirectorTeam(true)
        setDirectorTeamMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const payload = normalizeDirectorTeam(directorTeam)
            const { data, error } = await supabase.rpc("admin_update_ai_director_team", { p_team: payload })
            if (error) throw error
            setDirectorTeam(normalizeDirectorTeam(data))
            setDirectorTeamMessage("Agent team saved.")
        } catch (err: any) {
            setDirectorTeamMessage(`Could not save agent team: ${err.message || "Unknown error"}`)
        } finally {
            setIsSavingDirectorTeam(false)
        }
    }

    const loadStudioFeatureFlags = async () => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        setStudioFeatureFlags(await fetchStudioFeatureFlags(supabase))
    }

    const handleSaveStudioFeatureFlags = async () => {
        setIsSavingStudioFeatureFlags(true)
        setStudioFeatureFlagsMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const { data, error } = await supabase.rpc("admin_update_studio_feature_flags", { p_features: studioFeatureFlags })
            if (error) throw error
            setStudioFeatureFlags({ ...studioFeatureFlagDefaults, ...(data as Partial<StudioFeatureFlags>) })
            setStudioFeatureFlagsMessage("Studio runtime controls saved.")
        } catch (err: any) {
            setStudioFeatureFlagsMessage(`Could not save runtime controls: ${err.message || "Unknown error"}`)
        } finally {
            setIsSavingStudioFeatureFlags(false)
        }
    }

    const handleSaveDirectorRuntimeSettings = async () => {
        setIsSavingDirectorRuntimeSettings(true)
        setDirectorRuntimeSettingsMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const payload = normalizeDirectorRuntimeSettings(directorRuntimeSettings)
            const { data, error } = await supabase.rpc("admin_update_ai_director_runtime_settings", { p_settings: payload })
            if (error) throw error
            setDirectorRuntimeSettings(normalizeDirectorRuntimeSettings(data))
            setDirectorRuntimeSettingsMessage("Agent orchestration settings saved.")
        } catch (err: any) {
            setDirectorRuntimeSettingsMessage(`Could not save orchestration settings: ${err.message || "Unknown error"}`)
        } finally {
            setIsSavingDirectorRuntimeSettings(false)
        }
    }

    const handleSaveDirectorGlobalInstructions = async () => {
        setIsSavingDirectorGlobalInstructions(true)
        setDirectorGlobalInstructionsMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const payload = { instructions: directorGlobalInstructions.trim() || defaultDirectorGlobalInstructions }
            const { data, error } = await supabase.rpc("admin_update_ai_director_global_instructions", {
                p_instructions: payload,
            })
            if (error) {
                const { error: directError } = await supabase
                    .from("site_settings")
                    .upsert({ key: "ai_director_global_instructions", value: payload }, { onConflict: "key" })
                if (directError) throw error
            } else {
                setDirectorGlobalInstructions(normalizeDirectorGlobalInstructions(data))
            }
            setDirectorGlobalInstructionsMessage("Global AI Director instructions saved.")
        } catch (err: any) {
            setDirectorGlobalInstructionsMessage(`Could not save instructions: ${err.message || "Unknown error"}`)
        } finally {
            setIsSavingDirectorGlobalInstructions(false)
        }
    }

    const handleSaveDirectorWorkflows = async () => {
        setIsSavingDirectorWorkflows(true)
        setDirectorWorkflowsMessage("")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("No Supabase client")
            const { data, error } = await supabase.rpc("admin_update_ai_director_workflows", {
                p_workflows: directorWorkflows,
            })
            if (error) throw error
            setDirectorWorkflows(normalizeDirectorWorkflows(data))
            setDirectorWorkflowsMessage("AI Director workflows saved.")
        } catch (err: any) {
            setDirectorWorkflowsMessage(`Could not save workflows: ${err.message || "Unknown error"}`)
        } finally {
            setIsSavingDirectorWorkflows(false)
        }
    }

    const updateDirectorWorkflow = (id: string, patch: Partial<DirectorWorkflowConfig>) => {
        setDirectorWorkflows((workflows) => workflows.map((workflow) => workflow.id === id ? { ...workflow, ...patch } : workflow))
    }

    const addDirectorWorkflow = () => {
        const id = `custom_workflow_${Date.now()}`
        setDirectorWorkflows((workflows) => [
            ...workflows,
            {
                id,
                title: "New AI Workflow",
                description: "Describe when the AI Director should use this workflow.",
                skill: "Describe the skill set this workflow activates.",
                instructions: "Write step-by-step workflow instructions for scripts, characters, storyboard images, and video generation.",
                appliesTo: "project_default",
                status: "active",
            },
        ])
    }

    const deleteDirectorWorkflow = (id: string) => {
        if (!confirm("Delete this workflow? Existing projects using its id will fall back to the default workflow.")) return
        setDirectorWorkflows((workflows) => workflows.filter((workflow) => workflow.id !== id))
    }

    const loadShowcaseItems = async () => {
        setIsLoadingShowcase(true)
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) { setMockShowcase(adminShowcase); setIsLoadingShowcase(false); return }
            const { data, error } = await supabase
                .from('showcase_items')
                .select('*')
                .order('created_at', { ascending: false })
            if (error || !data) { setMockShowcase(adminShowcase); }
            else {
                setMockShowcase(data.map((r: any) => ({
                    id: r.id,
                    title: r.title,
                    description: r.description,
                    thumbnail: r.thumbnail,
                    videoUrl: r.video_url,
                })))
            }
        } catch { setMockShowcase(adminShowcase) }
        setIsLoadingShowcase(false)
    }

    const uploadShowcaseFile = async (file: File, folder: string): Promise<string> => {
        const supabase = await getServiceRequestClient()
        if (!supabase) throw new Error('No client')
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const path = `${folder}/${Date.now()}-${safeName}`
        const { error } = await supabase.storage.from('showcase-videos').upload(path, file, { upsert: false })
        if (error) throw error
        const { data } = supabase.storage.from('showcase-videos').getPublicUrl(path)
        return data.publicUrl
    }

    const handleAddShowcase = () => {
        const newItem: ShowcaseItem = {
            id: `new-${Date.now()}`,
            title: "New Showcase Video",
            description: "Describe this featured work...",
            thumbnail: "",
            videoUrl: ""
        }
        setShowcaseEditForm(newItem)
        setEditingShowcaseId(newItem.id)
        setShowcaseVideoFile(null)
        setShowcaseThumbnailFile(null)
        setShowcaseMessage("")
        // Don't add to list yet — only after save
    }

    const handleEditShowcase = (item: ShowcaseItem) => {
        setEditingShowcaseId(item.id)
        setShowcaseEditForm({ ...item })
        setShowcaseVideoFile(null)
        setShowcaseThumbnailFile(null)
        setShowcaseMessage("")
    }

    const handleSaveShowcase = async () => {
        if (!showcaseEditForm) return
        setShowcaseSaving(true)
        setShowcaseMessage("")
        setUploadStatus("Preparing...")
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) { setShowcaseMessage("Supabase not configured"); setShowcaseSaving(false); setUploadStatus(""); return }

            let videoUrl = showcaseEditForm.videoUrl
            let thumbnailUrl = showcaseEditForm.thumbnail

            // Upload video file if selected
            if (showcaseVideoFile) {
                setUploadStatus(`Uploading video (${(showcaseVideoFile.size / 1024 / 1024).toFixed(1)} MB)...`)
                videoUrl = await uploadShowcaseFile(showcaseVideoFile, 'videos')
                setUploadStatus("Video uploaded ✓")
            }
            // Upload thumbnail file if selected
            if (showcaseThumbnailFile) {
                setUploadStatus("Uploading thumbnail...")
                thumbnailUrl = await uploadShowcaseFile(showcaseThumbnailFile, 'thumbnails')
                setUploadStatus("Thumbnail uploaded ✓")
            }
            setUploadStatus("Saving to database...")

            const isNew = showcaseEditForm.id.startsWith('new-')

            if (isNew) {
                const { data, error } = await supabase
                    .from('showcase_items')
                    .insert({ title: showcaseEditForm.title, description: showcaseEditForm.description, thumbnail: thumbnailUrl, video_url: videoUrl })
                    .select('*')
                    .single()
                if (error) throw error
                setMockShowcase(prev => [{ id: data.id, title: data.title, description: data.description, thumbnail: data.thumbnail, videoUrl: data.video_url }, ...prev])
            } else {
                const { error } = await supabase
                    .from('showcase_items')
                    .update({ title: showcaseEditForm.title, description: showcaseEditForm.description, thumbnail: thumbnailUrl, video_url: videoUrl })
                    .eq('id', showcaseEditForm.id)
                if (error) throw error
                setMockShowcase(prev => prev.map(s => s.id === showcaseEditForm.id ? { ...showcaseEditForm, thumbnail: thumbnailUrl, videoUrl } : s))
            }

            setEditingShowcaseId(null)
            setShowcaseVideoFile(null)
            setShowcaseThumbnailFile(null)
            setUploadStatus("✓ Upload complete!")
            setShowcaseMessage("Saved to Supabase!")
            setTimeout(() => setUploadStatus(""), 3000)
        } catch (e: any) {
            setUploadStatus("")
            setShowcaseMessage(`Error: ${e.message || 'Could not save'}`)
        }
        setShowcaseSaving(false)
    }

    const handleDeleteShowcase = async (id: string) => {
        if (!confirm("Are you sure you want to remove this from showcase?")) return
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const { error } = await supabase.rpc('admin_delete_showcase', { item_id: id })
            if (error) throw error
            setMockShowcase(prev => prev.filter(s => s.id !== id))
            setShowcaseMessage("Deleted successfully.")
        } catch (e: any) {
            console.error('Delete showcase error:', e)
            setShowcaseMessage(`Could not delete item: ${e.message || 'Unknown error'}`)
        }
    }

    const handleUpdateChapters = async (courseId: string, updatedLessons: CourseLesson[]) => {
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error('No Supabase client')
            const lessonsPayload = updatedLessons.map((l: any, i: number) => ({
                title: l.title,
                duration: l.duration || '',
                video_url: l.videoUrl || '',
                order: i + 1,
                resources: l.resources || [],
                description: l.description || '',
                takeaways: l.takeaways || [],
            }))
            console.log('Saving lessons for course:', courseId, lessonsPayload)
            const { error } = await supabase.rpc('admin_upsert_lessons', {
                p_course_id: courseId,
                p_lessons: lessonsPayload,
            })
            if (error) throw error

            // Also update chapter count on the course
            await supabase.rpc('admin_upsert_course', {
                p_id: courseId,
                p_title: mockCourses.find(c => c.id === courseId)?.title || '',
                p_description: mockCourses.find(c => c.id === courseId)?.description || '',
                p_thumbnail: mockCourses.find(c => c.id === courseId)?.thumbnail || '',
                p_xp: mockCourses.find(c => c.id === courseId)?.xp || 0,
                p_duration: mockCourses.find(c => c.id === courseId)?.duration || '',
                p_level: mockCourses.find(c => c.id === courseId)?.level || 'Beginner',
                p_chapters: updatedLessons.length,
                p_instructor: mockCourses.find(c => c.id === courseId)?.instructor || '',
                p_price: mockCourses.find(c => c.id === courseId)?.price || 0,
            })

            setMockCourses(prev => prev.map(c =>
                c.id === courseId ? { ...c, lessons: updatedLessons, chapters: updatedLessons.length } : c
            ))
        } catch (err: any) {
            console.error('Failed to save lessons:', err)
            alert('Failed to save lessons: ' + (err.message || 'Unknown error'))
        }
    }

    const handleEditChallenge = (challenge: Challenge) => {
        setEditingChallengeId(challenge.id)
        setChallengeEditForm({ ...challenge })
    }

    const handleSaveChallenge = async () => {
        if (!challengeEditForm) return
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const { error } = await supabase.rpc('admin_upsert_challenge', {
                p_id: challengeEditForm.id, p_title: challengeEditForm.title,
                p_description: challengeEditForm.description, p_prize: challengeEditForm.prize,
                p_deadline: challengeEditForm.deadline || null, p_participants: challengeEditForm.participants,
                p_difficulty: challengeEditForm.difficulty, p_winner_id: challengeEditForm.winnerId || null,
            })
            if (error) throw error
            setMockChallenges(prev => prev.map(c => c.id === editingChallengeId ? challengeEditForm : c))
            setEditingChallengeId(null)
        } catch (err: any) {
            alert('Failed to save challenge: ' + (err.message || 'Unknown error'))
        }
    }

    const handleDeleteChallenge = async (id: string) => {
        if (!confirm("Are you sure you want to delete this challenge?")) return
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const { error } = await supabase.rpc('admin_delete_challenge', { challenge_id: id })
            if (error) throw error
            setMockChallenges(prev => prev.filter(c => c.id !== id))
        } catch (err: any) {
            console.error('Delete challenge error:', err)
            alert('Failed to delete challenge: ' + (err.message || JSON.stringify(err)))
        }
    }

    const handleAddChallenge = async () => {
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
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const { error } = await supabase.rpc('admin_upsert_challenge', {
                p_id: newChallenge.id, p_title: newChallenge.title,
                p_description: newChallenge.description, p_prize: newChallenge.prize,
                p_deadline: newChallenge.deadline, p_participants: newChallenge.participants,
                p_difficulty: newChallenge.difficulty, p_winner_id: null,
            })
            if (error) throw error
            setMockChallenges(prev => [newChallenge, ...prev])
            handleEditChallenge(newChallenge)
        } catch (err: any) {
            alert('Failed to add challenge: ' + (err.message || 'Unknown error'))
        }
    }

    const handleSelectWinner = async (challengeId: string, submissionId: string) => {
        setMockChallenges(mockChallenges.map(c =>
            c.id === challengeId ? { ...c, winnerId: submissionId } : c
        ))
        try {
            const supabase = await getServiceRequestClient()
            if (supabase) {
                await supabase
                    .from('challenges')
                    .update({ winner_id: submissionId })
                    .eq('id', challengeId)
            }
        } catch {}
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

    const loadAdminData = async () => {
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return

            // Fetch courses from Supabase
            const { data: dbCourses } = await supabase
                .from('courses')
                .select('*')
                .order('created_at', { ascending: true })
            if (dbCourses) {
                // Fetch lessons for all courses
                const { data: dbLessons } = await supabase
                    .from('lessons')
                    .select('*')
                    .order('order', { ascending: true })
                const lessonsByCourse: Record<string, any[]> = {}
                for (const l of (dbLessons || [])) {
                    if (!lessonsByCourse[l.course_id]) lessonsByCourse[l.course_id] = []
                    lessonsByCourse[l.course_id].push({
                        id: l.id,
                        title: l.title,
                        duration: l.duration,
                        videoUrl: l.video_url,
                        resources: l.resources || [],
                        description: l.description || '',
                        takeaways: l.takeaways || [],
                    })
                }
                setMockCourses(dbCourses.map((c: any) => ({
                    ...c,
                    lessons: lessonsByCourse[c.id] || [],
                    chapters: (lessonsByCourse[c.id] || []).length,
                })))
            }

            // Fetch challenges from Supabase
            const { data: dbChallenges } = await supabase
                .from('challenges')
                .select('*')
                .order('created_at', { ascending: true })
            if (dbChallenges) {
                const { data: dbSubmissions } = await supabase
                    .from('challenge_submissions')
                    .select('*')
                    .order('created_at', { ascending: false })
                const submissionsByChallenge = new Map<string, ChallengeSubmission[]>()
                ;(dbSubmissions || []).forEach((submission: any) => {
                    const current = submissionsByChallenge.get(submission.challenge_id) || []
                    current.push(mapChallengeSubmissionRow(submission))
                    submissionsByChallenge.set(submission.challenge_id, current)
                })

                setMockChallenges(dbChallenges.map((c: any) => ({
                    id: c.id,
                    title: c.title,
                    description: c.description,
                    prize: c.prize,
                    deadline: c.deadline || '',
                    participants: Math.max(c.participants || 0, submissionsByChallenge.get(c.id)?.length || 0),
                    difficulty: c.difficulty,
                    winnerId: c.winner_id || null,
                    submissions: submissionsByChallenge.get(c.id) || [],
                })))
            }

            // Fetch all enrollments with profile info
            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('profile_id, course_id, status, created_at')
                .order('created_at', { ascending: false })

            const { data: profileData } = await supabase
                .from('profiles')
                .select('id, full_name, email, avatar_url, created_at, membership_status, membership_expires_at, is_trial, bids')
                .order('created_at', { ascending: false })
            const profiles = profileData || []

            const profileMap = new Map(profiles.map((p: any) => [p.id, p]))
            const students: EnrolledStudent[] = (enrollments || []).map((e: any) => {
                const p: any = profileMap.get(e.profile_id) || {}
                return {
                    profile_id: e.profile_id,
                    course_id: e.course_id,
                    status: e.status,
                    created_at: e.created_at,
                    full_name: p.full_name || 'Unknown',
                    email: p.email || '',
                    avatar_url: p.avatar_url || '',
                    membership_status: p.membership_status,
                    membership_expires_at: p.membership_expires_at,
                    is_trial: p.is_trial,
                    bids: p.bids,
                }
            })
            const enrolledProfileIds = new Set(students.map((student) => student.profile_id))
            const freeStudents: EnrolledStudent[] = profiles
                .filter((profile: any) => !enrolledProfileIds.has(profile.id))
                .map((profile: any) => ({
                    profile_id: profile.id,
                    course_id: null,
                    status: 'free',
                    created_at: profile.created_at,
                    full_name: profile.full_name || 'Student',
                    email: profile.email || '',
                    avatar_url: profile.avatar_url || '',
                    membership_status: profile.membership_status,
                    membership_expires_at: profile.membership_expires_at,
                    is_trial: profile.is_trial,
                    bids: profile.bids,
                }))
            setEnrolledStudents([...students, ...freeStudents])

            // Count enrollments per course
            const courseEnrollments: Record<string, number> = {}
            ;(enrollments || []).forEach((e: any) => {
                courseEnrollments[e.course_id] = (courseEnrollments[e.course_id] || 0) + 1
            })

            // Count active challenges
            const { count: challengeCount } = await supabase
                .from('challenges')
                .select('*', { count: 'exact', head: true })

            // Build growth chart from enrollment dates (last 7 days)
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            const last7 = Array.from({ length: 7 }, (_, i) => {
                const d = new Date()
                d.setDate(d.getDate() - (6 - i))
                return d
            })
            const growth = last7.map(d => ({
                name: days[d.getDay()],
                joins: (enrollments || []).filter((e: any) => {
                    const ed = new Date(e.created_at)
                    return ed.toDateString() === d.toDateString()
                }).length,
            }))
            setGrowthData(growth)

            // Store all enrollments for analytics
            setAllEnrollments(enrollments || [])

            // Revenue comes from real successful payments (subscriptions + bid purchases),
            // not course enrollments.
            const { data: paymentsData } = await supabase
                .from('payments')
                .select('amount, created_at, status')
                .eq('status', 'success')
            const payments = (paymentsData || []).map((p: any) => ({
                amount: Number(p.amount) || 0,
                created_at: p.created_at,
            }))
            setAllPayments(payments)

            const today = new Date().toDateString()
            setTodayRevenue(
                payments
                    .filter((p) => new Date(p.created_at).toDateString() === today)
                    .reduce((sum, p) => sum + p.amount, 0)
            )
            setTotalRevenue(payments.reduce((sum, p) => sum + p.amount, 0))

            setAdminStats({
                totalStudents: profiles.length,
                totalEnrollments: (enrollments || []).length,
                activeChallenges: challengeCount || 0,
                courseEnrollments,
            })
        } catch (e) {
            // Stats remain at defaults
        }
    }

    const loadStudents = async () => {
        setIsLoadingStudents(true)
        await loadAdminData()
        setIsLoadingStudents(false)
    }

    // Analytics: compute chart data based on mode + date
    const getAnalyticsData = () => {
        const base = new Date(analyticsDate)
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        if (analyticsMode === 'daily') {
            // Show 7 days ending on analyticsDate
            const slots = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(base)
                d.setDate(d.getDate() - (6 - i))
                return d
            })
            return slots.map(d => {
                const dayPayments = allPayments.filter(p => new Date(p.created_at).toDateString() === d.toDateString())
                return {
                    name: `${d.getDate()} ${months[d.getMonth()]}`,
                    enrollments: dayPayments.length,
                    revenue: dayPayments.reduce((s, p) => s + p.amount, 0),
                }
            })
        }

        if (analyticsMode === 'weekly') {
            // Show 4 weeks ending on the week of analyticsDate
            const slots = Array.from({ length: 4 }, (_, i) => {
                const weekStart = new Date(base)
                weekStart.setDate(weekStart.getDate() - weekStart.getDay() - (3 - i) * 7)
                const weekEnd = new Date(weekStart)
                weekEnd.setDate(weekEnd.getDate() + 6)
                return { start: weekStart, end: weekEnd }
            })
            return slots.map(({ start, end }) => {
                const weekPayments = allPayments.filter(p => {
                    const d = new Date(p.created_at)
                    return d >= start && d <= new Date(end.getTime() + 86400000)
                })
                return {
                    name: `${start.getDate()} ${months[start.getMonth()]} - ${end.getDate()} ${months[end.getMonth()]}`,
                    enrollments: weekPayments.length,
                    revenue: weekPayments.reduce((s, p) => s + p.amount, 0),
                }
            })
        }

        // monthly — show 6 months ending on analyticsDate's month
        const slots = Array.from({ length: 6 }, (_, i) => {
            const d = new Date(base.getFullYear(), base.getMonth() - (5 - i), 1)
            return d
        })
        return slots.map(d => {
            const monthPayments = allPayments.filter(p => {
                const ed = new Date(p.created_at)
                return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear()
            })
            return {
                name: `${months[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
                enrollments: monthPayments.length,
                revenue: monthPayments.reduce((s, p) => s + p.amount, 0),
            }
        })
    }

    const analyticsChartData = getAnalyticsData()
    const analyticsPeriodRevenue = analyticsChartData.reduce((sum, d) => sum + d.revenue, 0)
    const analyticsPeriodEnrollments = analyticsChartData.reduce((sum, d) => sum + d.enrollments, 0)

    const navigateAnalytics = (direction: number) => {
        const d = new Date(analyticsDate)
        if (analyticsMode === 'daily') d.setDate(d.getDate() + direction * 7)
        else if (analyticsMode === 'weekly') d.setDate(d.getDate() + direction * 28)
        else d.setMonth(d.getMonth() + direction * 6)
        setAnalyticsDate(d)
    }

    const getAnalyticsLabel = () => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const d = analyticsDate
        if (analyticsMode === 'daily') {
            const start = new Date(d); start.setDate(start.getDate() - 6)
            return `${start.getDate()} ${months[start.getMonth()]} — ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
        }
        if (analyticsMode === 'weekly') {
            const start = new Date(d); start.setDate(start.getDate() - 21)
            return `${start.getDate()} ${months[start.getMonth()]} — ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
        }
        const start = new Date(d.getFullYear(), d.getMonth() - 5, 1)
        return `${months[start.getMonth()]} ${start.getFullYear()} — ${months[d.getMonth()]} ${d.getFullYear()}`
    }

    useEffect(() => {
        setIsChartReady(true)
        loadServiceRequests()
        loadBillingSettings()
        loadTrialSettings()
        loadDirectorModels()
        loadDirectorWorkflows()
        loadDirectorGlobalInstructions()
        loadDirectorRuntimeSettings()
        loadStudioFeatureFlags()
        loadSiteFeatures()
        loadAdminData()
        loadShowcaseItems()
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
                                    activeTab === "overview" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <LayoutDashboard className="w-4 h-4" /> Dashboard
                            </button>
                            <button
                                onClick={() => setActiveTab("courses")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "courses" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <BookOpen className="w-4 h-4" /> Manage Courses
                            </button>
                            <button
                                onClick={() => setActiveTab("showcase")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "showcase" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Tv className="w-4 h-4" /> Showcase Manager
                            </button>
                            <button
                                onClick={() => setActiveTab("blog")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "blog" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <FileText className="w-4 h-4" /> Blog
                            </button>
                            <button
                                onClick={() => setActiveTab("challenges")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "challenges" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Trophy className="w-4 h-4" /> Challenges
                            </button>
                            <button
                                onClick={() => setActiveTab("service-requests")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "service-requests" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Inbox className="w-4 h-4" /> Job Posts
                            </button>
                            <button
                                onClick={() => { setActiveTab("students"); loadStudents(); }}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "students" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Users className="w-4 h-4" /> Students
                            </button>
                            <button
                                onClick={() => setActiveTab("billing")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "billing" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <DollarSign className="w-4 h-4" /> Plan & Offers
                            </button>
                            <button
                                onClick={() => setActiveTab("ai-models")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "ai-models" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <Settings className="w-4 h-4" /> AI Models
                            </button>
                            <button
                                onClick={() => setActiveTab("ai-workflows")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "ai-workflows" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <LayoutDashboard className="w-4 h-4" /> AI Workflows
                            </button>
                            <button
                                onClick={() => setActiveTab("site-features")}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                                    activeTab === "site-features" ? "bg-primary text-black" : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <PauseCircle className="w-4 h-4" /> Pause Features
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
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                                    <StatCard label="Total Students" value={String(adminStats.totalStudents)} change="Live" icon={Users} color="text-lime-400" />
                                    <StatCard label="Total Enrollments" value={String(adminStats.totalEnrollments)} change="Live" icon={CheckCircle2} color="text-emerald-400" />
                                    <StatCard label="Total Revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} change="Subscriptions + bids" icon={DollarSign} color="text-lime-300" />
                                    <StatCard label="Today's Sales" value={`₹${todayRevenue.toLocaleString('en-IN')}`} change="Live" icon={TrendingUp} color="text-amber-400" />
                                    <StatCard label="Active Challenges" value={String(adminStats.activeChallenges)} change="Live" icon={Play} color="text-red-400" />
                                </div>

                                {/* Analytics Panel */}
                                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-6">
                                    {/* Header: mode toggle + date navigation */}
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="font-bold text-lg">Revenue Analytics</h3>
                                            <p className="text-xs text-white/30">Subscriptions + bid purchases • {getAnalyticsLabel()}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {/* Mode Toggle */}
                                            <div className="flex bg-white/5 rounded-xl p-1">
                                                {(['daily', 'weekly', 'monthly'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        onClick={() => { setAnalyticsMode(mode); setAnalyticsDate(new Date()) }}
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                                            analyticsMode === mode ? "bg-primary text-black" : "text-white/40 hover:text-white"
                                                        )}
                                                    >
                                                        {mode}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Date Navigation */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => navigateAnalytics(-1)}
                                                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                                                    title="Previous period"
                                                >
                                                    <ChevronLeft className="w-4 h-4 text-white/60" />
                                                </button>
                                                <button
                                                    onClick={() => setAnalyticsDate(new Date())}
                                                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                                                    title="Today"
                                                >
                                                    <Calendar className="w-4 h-4 text-white/60" />
                                                </button>
                                                <button
                                                    onClick={() => navigateAnalytics(1)}
                                                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                                                    title="Next period"
                                                >
                                                    <ChevronRight className="w-4 h-4 text-white/60" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Period Summary */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Period Revenue</p>
                                            <p className="text-xl font-bold text-lime-300">₹{analyticsPeriodRevenue.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Enrollments</p>
                                            <p className="text-xl font-bold text-emerald-400">{analyticsPeriodEnrollments}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Avg / {analyticsMode === 'daily' ? 'Day' : analyticsMode === 'weekly' ? 'Week' : 'Month'}</p>
                                            <p className="text-xl font-bold text-amber-400">₹{Math.round(analyticsPeriodRevenue / analyticsChartData.length || 0).toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Best {analyticsMode === 'daily' ? 'Day' : analyticsMode === 'weekly' ? 'Week' : 'Month'}</p>
                                            <p className="text-xl font-bold text-lime-400">₹{Math.max(...analyticsChartData.map(d => d.revenue), 0).toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>

                                    {/* Charts side by side */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Revenue Bar Chart */}
                                        <div>
                                            <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Revenue</p>
                                            <div className="h-[250px] w-full">
                                                {isChartReady ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={analyticsChartData}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                                            <XAxis dataKey="name" stroke="#ffffff20" fontSize={9} axisLine={false} tickLine={false} angle={analyticsMode === 'weekly' ? -20 : 0} textAnchor={analyticsMode === 'weekly' ? 'end' : 'middle'} />
                                                            <YAxis stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                                                            <Tooltip
                                                                contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                                                itemStyle={{ color: '#fff' }}
                                                                formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Revenue']}
                                                            />
                                                            <Bar dataKey="revenue" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div className="h-full w-full rounded-2xl border border-white/5 bg-white/[0.02]" />
                                                )}
                                            </div>
                                        </div>

                                        {/* Enrollments Area Chart */}
                                        <div>
                                            <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Enrollments</p>
                                            <div className="h-[250px] w-full">
                                                {isChartReady ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <AreaChart data={analyticsChartData}>
                                                            <defs>
                                                                <linearGradient id="colorEnroll" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#C4F52B" stopOpacity={0.3} />
                                                                    <stop offset="95%" stopColor="#C4F52B" stopOpacity={0} />
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                                            <XAxis dataKey="name" stroke="#ffffff20" fontSize={9} axisLine={false} tickLine={false} angle={analyticsMode === 'weekly' ? -20 : 0} textAnchor={analyticsMode === 'weekly' ? 'end' : 'middle'} />
                                                            <YAxis stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                                                            <Tooltip
                                                                contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                                                itemStyle={{ color: '#fff' }}
                                                            />
                                                            <Area type="monotone" dataKey="enrollments" stroke="#C4F52B" fillOpacity={1} fill="url(#colorEnroll)" strokeWidth={3} />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div className="h-full w-full rounded-2xl border border-white/5 bg-white/[0.02]" />
                                                )}
                                            </div>
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
                                                    <ImageOrPlaceholder src={course.thumbnail} className="w-full md:w-48 aspect-video object-cover rounded-xl" />
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
                                                                <input
                                                                    value={editForm?.thumbnail ?? ""}
                                                                    onChange={(e) => setEditForm(prev => prev ? { ...prev, thumbnail: e.target.value } : prev)}
                                                                    className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                                    placeholder="Thumbnail Image URL"
                                                                />
                                                                <div className="space-y-2">
                                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Course Access</p>
                                                                    <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                                                                        {[
                                                                            { label: "Free", value: "Free" },
                                                                            { label: "Pro Membership", value: "Paid" },
                                                                        ].map((option) => (
                                                                            <button
                                                                                key={option.value}
                                                                                type="button"
                                                                                onClick={() => setEditForm(prev => prev ? { ...prev, price: option.value } : prev)}
                                                                                className={cn(
                                                                                    "px-4 py-2 rounded-lg text-xs font-bold transition-colors",
                                                                                    editForm?.price === option.value
                                                                                        ? "bg-primary text-black"
                                                                                        : "text-white/40 hover:text-white hover:bg-white/5"
                                                                                )}
                                                                            >
                                                                                {option.label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    <p className="text-xs text-white/30">
                                                                        Pro Membership courses require the current monthly plan.
                                                                    </p>
                                                                </div>
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
                                                                    <div className="flex items-center gap-3 mb-1">
                                                                        <h3 className="text-xl font-bold">{course.title}</h3>
                                                                        {course.is_paused ? (
                                                                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                                                                <PauseCircle className="w-3 h-3" /> Paused
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                                                                <PlayCircle className="w-3 h-3" /> Active
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-sm text-white/40 line-clamp-2">{course.description}</p>
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold tracking-widest uppercase text-white/30">
                                                                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {adminStats.courseEnrollments[course.id] || 0} Enrolled</span>
                                                                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {course.chapters} Chapters</span>
                                                                    <span className={cn(
                                                                        "px-2 py-1 rounded-md",
                                                                        course.price === "Free" || course.price === "$0"
                                                                            ? "bg-emerald-400/10 text-emerald-400"
                                                                            : "bg-primary/10 text-primary"
                                                                    )}>
                                                                        {course.price === "Free" || course.price === "$0" ? "Free" : "Pro Membership"}
                                                                    </span>
                                                                    <span className="flex items-center gap-1 text-primary"><FileText className="w-3 h-3 " /> {course.lessons?.length || 0} Lessons with resources</span>
                                                                </div>
                                                                <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                                                                    <button onClick={() => handleEditCourse(course)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="Edit Course Details">
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteCourse(course.id)}
                                                                        className="p-2 bg-white/5 rounded-lg hover:bg-red-500/10 text-white/60 hover:text-red-400 transition-colors"
                                                                        title="Delete Course"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleTogglePauseCourse(course)}
                                                                        className={cn(
                                                                            "px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                                                                            course.is_paused
                                                                                ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
                                                                                : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30"
                                                                        )}
                                                                        title={course.is_paused ? "Resume course to make it visible to students" : "Pause course to hide it from students"}
                                                                    >
                                                                        {course.is_paused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                                                                        <span>{course.is_paused ? "Resume Course" : "Pause Course"}</span>
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
                                        <p className="text-white/40 text-sm">Curate the videos displayed in the &quot;Our Featured Work&quot; section on the homepage.</p>
                                    </header>
                                    <button
                                        onClick={handleAddShowcase}
                                        className="px-5 py-2.5 bg-primary rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                                    >
                                        <Plus className="w-4 h-4" /> Add Showcase
                                    </button>
                                </div>

                                {isLoadingShowcase && <div className="text-white/40 text-sm">Loading showcase items...</div>}
                                {showcaseMessage && !editingShowcaseId && <p className="text-xs text-white/50">{showcaseMessage}</p>}

                                {/* New item form */}
                                {editingShowcaseId?.startsWith('new-') && showcaseEditForm && (
                                    <div className="glass-card overflow-hidden p-6 space-y-4">
                                        <h3 className="font-bold text-lg mb-2">Add New Showcase Video</h3>
                                        <div className="space-y-4">
                                            <input value={showcaseEditForm.title} onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)} className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full" placeholder="Video Title" />
                                            <textarea value={showcaseEditForm.description} onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, description: e.target.value } : prev)} className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full h-24" placeholder="Short Description" />
                                            <div>
                                                <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 block">Upload Video</label>
                                                <input type="file" accept="video/*" onChange={(e) => setShowcaseVideoFile(e.target.files?.[0] || null)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary/20 file:px-3 file:py-1 file:text-primary file:text-xs file:font-bold" />
                                            </div>
                                            <input value={showcaseEditForm.videoUrl} onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, videoUrl: e.target.value } : prev)} className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full" placeholder="Or paste Video URL" />
                                            <div>
                                                <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 block">Upload Thumbnail</label>
                                                <input type="file" accept="image/*" onChange={(e) => setShowcaseThumbnailFile(e.target.files?.[0] || null)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary/20 file:px-3 file:py-1 file:text-primary file:text-xs file:font-bold" />
                                            </div>
                                            <input value={showcaseEditForm.thumbnail} onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, thumbnail: e.target.value } : prev)} className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full" placeholder="Or paste Thumbnail URL" />
                                        </div>
                                        {uploadStatus && showcaseSaving && (
                                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                                                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                                                <span className="text-xs font-medium text-primary">{uploadStatus}</span>
                                            </motion.div>
                                        )}
                                        {uploadStatus && !showcaseSaving && uploadStatus.includes('✓') && (
                                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                                <span className="text-xs font-medium text-emerald-400">{uploadStatus}</span>
                                            </motion.div>
                                        )}
                                        {showcaseMessage && <p className="text-xs text-white/50">{showcaseMessage}</p>}
                                        <div className="flex items-center gap-3">
                                            <button onClick={handleSaveShowcase} disabled={showcaseSaving} className="px-4 py-2 bg-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50">
                                                {showcaseSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</> : <><Save className="w-3.5 h-3.5" /> Save & Publish</>}
                                            </button>
                                            <button onClick={() => { setEditingShowcaseId(null); setShowcaseVideoFile(null); setShowcaseThumbnailFile(null) }} className="px-4 py-2 bg-white/5 rounded-lg text-xs font-bold flex items-center gap-2">
                                                <X className="w-3.5 h-3.5" /> Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

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
                                                        <div>
                                                            <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 block">Video File</label>
                                                            <input
                                                                type="file"
                                                                accept="video/*"
                                                                onChange={(e) => setShowcaseVideoFile(e.target.files?.[0] || null)}
                                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary/20 file:px-3 file:py-1 file:text-primary file:text-xs file:font-bold"
                                                            />
                                                            {showcaseEditForm?.videoUrl && !showcaseVideoFile && (
                                                                <p className="text-[10px] text-white/30 mt-1 truncate">Current: {showcaseEditForm.videoUrl}</p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 block">Video URL (or use upload above)</label>
                                                            <input
                                                                value={showcaseEditForm?.videoUrl ?? ""}
                                                                onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, videoUrl: e.target.value } : prev)}
                                                                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                                placeholder="https://youtube.com/... or leave blank to upload"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 block">Thumbnail Image</label>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                onChange={(e) => setShowcaseThumbnailFile(e.target.files?.[0] || null)}
                                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary/20 file:px-3 file:py-1 file:text-primary file:text-xs file:font-bold"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1 block">Thumbnail URL (or use upload above)</label>
                                                            <input
                                                                value={showcaseEditForm?.thumbnail ?? ""}
                                                                onChange={(e) => setShowcaseEditForm(prev => prev ? { ...prev, thumbnail: e.target.value } : prev)}
                                                                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary w-full"
                                                                placeholder="https://... or leave blank to upload"
                                                            />
                                                        </div>
                                                    </div>
                                                    {uploadStatus && showcaseSaving && (
                                                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                                                            <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                                                            <span className="text-xs font-medium text-primary">{uploadStatus}</span>
                                                        </motion.div>
                                                    )}
                                                    {uploadStatus && !showcaseSaving && uploadStatus.includes('✓') && (
                                                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                                            <span className="text-xs font-medium text-emerald-400">{uploadStatus}</span>
                                                        </motion.div>
                                                    )}
                                                    {showcaseMessage && (
                                                        <p className="text-xs text-white/50">{showcaseMessage}</p>
                                                    )}
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={handleSaveShowcase}
                                                            disabled={showcaseSaving}
                                                            className="px-4 py-2 bg-emerald-500 rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                                                        >
                                                            {showcaseSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</> : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                                                        </button>
                                                        <button
                                                            onClick={() => { setEditingShowcaseId(null); setShowcaseVideoFile(null); setShowcaseThumbnailFile(null) }}
                                                            className="px-4 py-2 bg-white/5 rounded-lg text-xs font-bold flex items-center gap-2"
                                                        >
                                                            <X className="w-3.5 h-3.5" /> Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative aspect-video">
                                                        <ImageOrPlaceholder src={item.thumbnail} className="w-full h-full object-cover" />
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
                        {activeTab === "blog" && (
                            <motion.div
                                key="blog"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <BlogManager />
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
                                                                            <div className="absolute -top-2 -right-2 bg-primary text-black p-1 rounded-full shadow-lg z-10">
                                                                                <Trophy className="w-3 h-3" />
                                                                            </div>
                                                                        )}
                                                                        <div className="flex gap-3">
                                                                            <div className="relative group/thumb w-16 aspect-video shrink-0">
                                                                                <ImageOrPlaceholder src={sub.thumbnail} className="w-full h-full object-cover rounded-lg" />
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
                                                                                        challenge.winnerId === sub.id ? "bg-primary text-black" : "bg-white/5 text-white/40 hover:bg-primary hover:text-black"
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
                                        <h1 className="text-3xl font-bold tracking-tight mb-2">Job Posts</h1>
                                        <p className="text-white/40 text-sm">Approve AI video jobs before they appear in the marketplace.</p>
                                    </header>
                                    <button
                                        onClick={loadServiceRequests}
                                        className="px-5 py-2.5 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-white/20 transition-colors"
                                    >
                                        <Download className="w-4 h-4" /> Refresh
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <StatCard label="Pending Review" value={String(serviceRequests.filter(request => request.status === "pending").length)} change="Approve before live" icon={Inbox} color="text-lime-300" />
                                    <StatCard label="Live Jobs" value={String(serviceRequests.filter(request => request.status === "approved").length)} change="Open for bids" icon={Mail} color="text-amber-400" />
                                    <StatCard label="Awarded" value={String(serviceRequests.filter(request => request.status === "awarded").length)} change="Creator selected" icon={CheckCircle2} color="text-emerald-400" />
                                </div>

                                {serviceRequestsMessage && (
                                    <div className="glass-card p-4 text-sm text-white/50 border-white/10">
                                        {serviceRequestsMessage}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    {isLoadingServiceRequests ? (
                                        <div className="glass-card p-8 text-center text-white/40">Loading jobs...</div>
                                    ) : serviceRequests.length === 0 ? (
                                        <div className="glass-card p-12 text-center">
                                            <Inbox className="w-12 h-12 text-white/20 mx-auto mb-4" />
                                            <h2 className="text-2xl font-bold mb-2">No Jobs Yet</h2>
                                            <p className="text-white/40">New job posts will appear here for approval.</p>
                                        </div>
                                    ) : (
                                        serviceRequests.map((request) => (
                                            <article key={request.id} className="glass-card p-6 rounded-2xl border-white/10 space-y-5">
                                                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <h3 className="text-xl font-bold">{request.title}</h3>
                                                            <span className={cn(
                                                                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                                                                request.status === "pending" ? "bg-lime-300/10 text-lime-200" :
                                                                    request.status === "approved" ? "bg-amber-400/10 text-amber-300" :
                                                                        request.status === "awarded" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/10 text-white/50"
                                                            )}>
                                                                {request.status}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-white/50">Posted by {request.fullName}</p>
                                                        <div className="flex flex-wrap gap-3 text-sm text-primary">
                                                            <a href={`mailto:${request.email}`} className="hover:underline flex items-center gap-2">
                                                                <Mail className="w-4 h-4" /> {request.email}
                                                            </a>
                                                            {request.phone && <span className="flex items-center gap-2"><Phone className="w-4 h-4" /> {request.phone}</span>}
                                                        </div>
                                                        <p className="text-xs text-white/30">
                                                            Submitted {new Date(request.createdAt).toLocaleString()}
                                                        </p>
                                                    </div>

                                                    <select
                                                        value={request.status}
                                                        onChange={(event) => handleServiceStatusChange(request.id, event.target.value as ServiceRequestStatus)}
                                                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white/70 outline-none focus:border-primary"
                                                    >
                                                        <option value="pending" className="bg-[#1a1a2e]">Pending</option>
                                                        <option value="approved" className="bg-[#1a1a2e]">Approved</option>
                                                        <option value="rejected" className="bg-[#1a1a2e]">Rejected</option>
                                                        <option value="awarded" className="bg-[#1a1a2e]">Awarded</option>
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
                                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                    <div className="flex items-center justify-between gap-4 mb-4">
                                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Bids</p>
                                                        <span className="text-xs text-white/40">{request.bids.length} offer{request.bids.length === 1 ? "" : "s"}</span>
                                                    </div>
                                                    {request.bids.length === 0 ? (
                                                        <p className="text-sm text-white/35">No creator bids yet.</p>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {request.bids.map((bid) => (
                                                                <div key={bid.id} className="rounded-xl border border-white/5 bg-black/10 p-4 space-y-2">
                                                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                                                        <div>
                                                                            <p className="font-bold">{bid.bidderName}</p>
                                                                            <p className="text-xs text-white/40">{bid.offerAmount}</p>
                                                                        </div>
                                                                        <span className={cn(
                                                                            "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider w-fit",
                                                                            bid.status === "selected" ? "bg-emerald-400/10 text-emerald-300" :
                                                                                bid.status === "rejected" ? "bg-red-400/10 text-red-300" : "bg-white/5 text-white/40"
                                                                        )}>{bid.status}</span>
                                                                    </div>
                                                                    <p className="text-sm text-white/60 whitespace-pre-wrap">{bid.message}</p>
                                                                    {bid.status === "selected" && (
                                                                        <div className="flex flex-wrap gap-3 text-xs text-emerald-300">
                                                                            <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {bid.bidderEmail}</span>
                                                                            {bid.bidderPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {bid.bidderPhone}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </article>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "students" && (
                            <motion.div
                                key="students"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <header>
                                        <h1 className="text-3xl font-bold tracking-tight mb-2">Students</h1>
                                        <p className="text-white/40 text-sm">{adminStats.totalStudents} total students across {adminStats.totalEnrollments} enrollments.</p>
                                    </header>
                                    <button
                                        onClick={loadStudents}
                                        className="px-5 py-2.5 bg-white/10 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-white/20 transition-colors"
                                    >
                                        <Download className="w-4 h-4" /> Refresh
                                    </button>
                                </div>

                                {isLoadingStudents ? (
                                    <div className="glass-card p-8 text-center text-white/40">Loading students...</div>
                                ) : enrolledStudents.length === 0 ? (
                                    <div className="glass-card p-12 text-center">
                                        <Users className="w-12 h-12 text-white/20 mx-auto mb-4" />
                                        <h2 className="text-2xl font-bold mb-2">No Students Yet</h2>
                                        <p className="text-white/40">Students will appear here after they sign in.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Group by student */}
                                        {(() => {
                                            const grouped = new Map<string, EnrolledStudent[]>()
                                            enrolledStudents.forEach(s => {
                                                const existing = grouped.get(s.profile_id) || []
                                                existing.push(s)
                                                grouped.set(s.profile_id, existing)
                                            })
                                            return Array.from(grouped.entries()).map(([profileId, entries]) => {
                                                const student = entries[0]
                                                const enrolledCourseCount = entries.filter((entry) => entry.course_id !== null).length
                                                const memberActive = student.membership_status === 'active' && (!student.membership_expires_at || new Date(student.membership_expires_at).getTime() > Date.now())
                                                const memberLabel = memberActive ? (student.is_trial ? 'Trial' : 'Pro Member') : 'Free'
                                                return (
                                                    <div key={profileId} className="glass-card p-6 rounded-2xl border-white/10">
                                                        <div className="flex items-center gap-4 mb-4">
                                                            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center overflow-hidden">
                                                                {student.avatar_url ? (
                                                                    <img src={student.avatar_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Users className="w-5 h-5 text-primary" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <h3 className="text-lg font-bold">{student.full_name}</h3>
                                                                <p className="text-sm text-white/40">{student.email}</p>
                                                            </div>
                                                            <div className="ml-auto flex items-center gap-2">
                                                                <span className={cn(
                                                                    "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                                                                    memberActive
                                                                        ? (student.is_trial ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400")
                                                                        : "bg-white/5 text-white/40"
                                                                )}>{memberLabel}</span>
                                                                <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/5 text-white/50">{student.bids ?? 0} bids</span>
                                                                <span className="text-xs font-bold text-primary">{enrolledCourseCount} course{enrolledCourseCount === 1 ? '' : 's'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {entries[0]?.course_id === null ? (
                                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs">
                                                                    <Users className="w-3 h-3 text-white/40" />
                                                                    <span className="font-medium">No course enrollment</span>
                                                                    <span className="text-white/20">Joined {new Date(student.created_at).toLocaleDateString()}</span>
                                                                </div>
                                                            ) : entries.map((e, i) => {
                                                                if (!e.course_id) return null
                                                                const courseName = mockCourses.find(c => c.id === e.course_id)?.title || e.course_id
                                                                return (
                                                                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs">
                                                                        <BookOpen className="w-3 h-3 text-primary" />
                                                                        <span className="font-medium">{courseName}</span>
                                                                        <span className={cn(
                                                                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                                                            e.status === 'active' ? "bg-emerald-400/10 text-emerald-400" : "bg-white/5 text-white/40"
                                                                        )}>{e.status}</span>
                                                                        <span className="text-white/20">{new Date(e.created_at).toLocaleDateString()}</span>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        })()}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeTab === "billing" && (
                            <motion.div
                                key="billing"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <header>
                                    <h1 className="text-3xl font-bold tracking-tight mb-2">Plan & Offer Settings</h1>
                                    <p className="text-white/40 text-sm">Update the Pro membership price, discount offer, and top header banner.</p>
                                </header>

                                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-6 max-w-3xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <label className="space-y-2">
                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Monthly Price (₹)</span>
                                            <input
                                                type="number"
                                                min={1}
                                                value={billingSettings.monthlyPrice}
                                                onChange={(e) => setBillingSettings(prev => ({ ...prev, monthlyPrice: Number(e.target.value) }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                            />
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Offer Price (₹)</span>
                                            <input
                                                type="number"
                                                min={1}
                                                value={billingSettings.offerPrice}
                                                onChange={(e) => setBillingSettings(prev => ({ ...prev, offerPrice: Number(e.target.value) }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                            />
                                        </label>
                                    </div>

                                    <label className="space-y-2 block">
                                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Offer Banner Text</span>
                                        <input
                                            value={billingSettings.offerText}
                                            onChange={(e) => setBillingSettings(prev => ({ ...prev, offerText: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                            placeholder="Limited offer: AI Mastery Pro for ₹799/month"
                                        />
                                    </label>

                                    <label className="flex items-center justify-between gap-4 rounded-xl bg-white/5 border border-white/10 p-4">
                                        <div>
                                            <p className="font-bold">Show Offer On Upper Header</p>
                                            <p className="text-xs text-white/40 mt-1">Displays the offer text above the navigation bar and uses the offer price at checkout.</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={billingSettings.offerEnabled}
                                            onChange={(e) => setBillingSettings(prev => ({ ...prev, offerEnabled: e.target.checked }))}
                                            className="h-5 w-5 accent-primary"
                                        />
                                    </label>

                                    <label className="flex items-center justify-between gap-4 rounded-xl bg-white/5 border border-white/10 p-4">
                                        <div>
                                            <p className="font-bold">Enable Payments</p>
                                            <p className="text-xs text-white/40 mt-1">When OFF, the billing page hides the checkout button and shows &quot;Early Access - Free Pro!&quot; instead.</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={billingSettings.paymentsEnabled}
                                            onChange={(e) => setBillingSettings(prev => ({ ...prev, paymentsEnabled: e.target.checked }))}
                                            className="h-5 w-5 accent-primary"
                                        />
                                    </label>

                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Current Checkout Price</p>
                                        <p className="text-2xl font-bold">₹{pricePerEnrollment}/month</p>
                                        {!billingSettings.paymentsEnabled && (
                                            <p className="text-xs text-amber-400 mt-2">Payments are currently disabled. Users see the free access message.</p>
                                        )}
                                    </div>

                                    {billingMessage && <p className="text-sm text-white/50">{billingMessage}</p>}

                                    <button
                                        onClick={handleSaveBillingSettings}
                                        disabled={isSavingBilling}
                                        className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-60"
                                    >
                                        {isSavingBilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {isSavingBilling ? "Saving..." : "Save Plan Settings"}
                                    </button>
                                </div>

                                <header className="pt-4">
                                    <h2 className="text-2xl font-bold tracking-tight mb-2">Free Trial Settings</h2>
                                    <p className="text-white/40 text-sm">Control the free Pro trial given to new signups.</p>
                                </header>

                                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-6 max-w-3xl">
                                    <label className="flex items-center justify-between gap-4 rounded-xl bg-white/5 border border-white/10 p-4">
                                        <div>
                                            <p className="font-bold">Enable Free Trial</p>
                                            <p className="text-xs text-white/40 mt-1">New signups automatically get Pro access for the trial period.</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={trialSettings.enabled}
                                            onChange={(e) => setTrialSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                                            className="h-5 w-5 accent-primary"
                                        />
                                    </label>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <label className="space-y-2">
                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Trial Duration (days)</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={90}
                                                value={trialSettings.trialDays}
                                                onChange={(e) => setTrialSettings(prev => ({ ...prev, trialDays: Number(e.target.value) }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                            />
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Promotion End Date</span>
                                            <input
                                                type="date"
                                                value={trialSettings.promoEndDate}
                                                onChange={(e) => setTrialSettings(prev => ({ ...prev, promoEndDate: e.target.value }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                            />
                                        </label>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
                                        {trialSettings.enabled
                                            ? <>New users get <strong className="text-white">{trialSettings.trialDays} days</strong> free Pro until <strong className="text-white">{trialSettings.promoEndDate}</strong>. After that date, new signups won&apos;t get a trial.</>
                                            : <span className="text-amber-400">Free trial is disabled. New signups start on the free plan.</span>
                                        }
                                    </div>

                                    {trialMessage && <p className="text-sm text-white/50">{trialMessage}</p>}

                                    <button
                                        onClick={handleSaveTrialSettings}
                                        disabled={isSavingTrial}
                                        className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-60"
                                    >
                                        {isSavingTrial ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {isSavingTrial ? "Saving..." : "Save Trial Settings"}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "ai-models" && (
                            <motion.div
                                key="ai-models"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <header>
                                    <h1 className="text-3xl font-bold tracking-tight mb-2">AI Director Models</h1>
                                    <p className="text-white/40 text-sm">Pause models to remove them from the Studio chat selector. Resume them when they are ready again.</p>
                                </header>

                                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-4 max-w-4xl">
                                    {directorModels.map((model) => {
                                        const isPaused = model.status === "paused"
                                        return (
                                            <div key={model.id} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <p className="font-bold">{model.label}</p>
                                                        <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider", isPaused ? "bg-amber-400/10 text-amber-300" : "bg-lime-400/10 text-lime-300")}>
                                                            {isPaused ? "Paused" : "Active"}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 font-mono text-xs text-white/35">{model.id}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setDirectorModelStatus(model.id, "paused")}
                                                        disabled={isPaused}
                                                        className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                                                    >
                                                        <Ban className="h-4 w-4" /> Pause
                                                    </button>
                                                    <button
                                                        onClick={() => setDirectorModelStatus(model.id, "active")}
                                                        disabled={!isPaused}
                                                        className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-lime-300 transition hover:bg-lime-400/10 disabled:cursor-not-allowed disabled:opacity-35"
                                                    >
                                                        <Play className="h-4 w-4" /> Rerun
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
                                        Active models appear in the Studio chat model dropdown. Paused models are blocked server-side too, so users cannot call them by editing the browser request.
                                    </div>

                                    {directorModelsMessage && <p className="text-sm text-white/50">{directorModelsMessage}</p>}

                                    <button
                                        onClick={handleSaveDirectorModels}
                                        disabled={isSavingDirectorModels}
                                        className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-60"
                                    >
                                        {isSavingDirectorModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {isSavingDirectorModels ? "Saving..." : "Save Model Settings"}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "ai-workflows" && (
                            <motion.div
                                key="ai-workflows"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <header>
                                    <h1 className="text-3xl font-bold tracking-tight mb-2">AI Director Workflows</h1>
                                    <p className="text-white/40 text-sm">Define reusable workflow instructions and skills for scripts, characters, storyboard images, and video generation.</p>
                                </header>

                                <div className="glass-card rounded-2xl border-white/10 p-6 space-y-5">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Studio Runtime Controls</h2>
                                        <p className="mt-1 text-sm leading-6 text-white/45">Enable or pause AI Director tools, approval proposals, continuity checks, and generation pipelines without changing code.</p>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {(Object.keys(studioFeatureFlagDefaults) as Array<keyof StudioFeatureFlags>).map((key) => (
                                            <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
                                                <span className="text-sm font-medium text-white/75">{key.replaceAll("_", " ")}</span>
                                                <input
                                                    type="checkbox"
                                                    checked={studioFeatureFlags[key]}
                                                    onChange={(event) => setStudioFeatureFlags((flags) => ({ ...flags, [key]: event.target.checked }))}
                                                    className="h-5 w-5 accent-lime-300"
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        {studioFeatureFlagsMessage ? <p className="text-sm text-white/50">{studioFeatureFlagsMessage}</p> : <span />}
                                        <button type="button" onClick={handleSaveStudioFeatureFlags} disabled={isSavingStudioFeatureFlags} className="btn-primary flex shrink-0 items-center gap-2 px-5 py-3 disabled:opacity-60">
                                            {isSavingStudioFeatureFlags ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            {isSavingStudioFeatureFlags ? "Saving..." : "Save Runtime Controls"}
                                        </button>
                                    </div>
                                </div>

                                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-4">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Global Agent Instructions</h2>
                                            <p className="mt-1 text-sm leading-6 text-white/45">
                                                These rules are added to every AI Director chat before workflow-specific instructions.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDirectorGlobalInstructions(defaultDirectorGlobalInstructions)}
                                            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-white/60 hover:bg-white/10"
                                        >
                                            Restore Default
                                        </button>
                                    </div>
                                    <textarea
                                        value={directorGlobalInstructions}
                                        onChange={(event) => setDirectorGlobalInstructions(event.target.value)}
                                        rows={10}
                                        className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm leading-6 text-white outline-none focus:border-primary"
                                        placeholder="Rules for how the AI Director should handle script saves, normal conversation, asset creation, approvals, and production commands..."
                                    />
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <p className="text-xs leading-5 text-white/35">
                                            Keep script-save rules strict so normal chat messages do not get appended to the Script tab.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleSaveDirectorGlobalInstructions}
                                            disabled={isSavingDirectorGlobalInstructions}
                                            className="btn-primary flex shrink-0 items-center gap-2 px-5 py-3 disabled:opacity-60"
                                        >
                                            {isSavingDirectorGlobalInstructions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {isSavingDirectorGlobalInstructions ? "Saving..." : "Save Global Instructions"}
                                        </button>
                                    </div>
                                    {directorGlobalInstructionsMessage && <p className="text-sm text-white/50">{directorGlobalInstructionsMessage}</p>}
                                </div>

                                <div className="glass-card rounded-2xl border-white/10 p-6 space-y-5">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Agent Orchestration</h2>
                                            <p className="mt-1 text-sm leading-6 text-white/45">Control how the Director chooses tools, delegates specialist responsibilities, recovers from errors, and limits each chat run.</p>
                                        </div>
                                        <button type="button" onClick={() => setDirectorRuntimeSettings(structuredClone(defaultDirectorRuntimeSettings))} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-white/60 hover:bg-white/10">Restore Default</button>
                                    </div>

                                    <label className="block space-y-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Orchestrator Instructions</span>
                                        <textarea value={directorRuntimeSettings.orchestrationInstructions} onChange={(event) => setDirectorRuntimeSettings((settings) => ({ ...settings, orchestrationInstructions: event.target.value }))} rows={6} className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm leading-6 text-white outline-none focus:border-primary" placeholder="Rules for choosing tools, approvals, status reporting, and failure recovery..." />
                                    </label>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <label className="space-y-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Maximum Tool Steps Per Reply</span>
                                            <input type="number" min={1} max={25} value={directorRuntimeSettings.maxToolSteps} onChange={(event) => setDirectorRuntimeSettings((settings) => ({ ...settings, maxToolSteps: Math.max(1, Math.min(25, Number(event.target.value) || 1)) }))} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-primary" />
                                            <p className="text-xs text-white/35">Higher values allow longer autonomous workflows but increase latency and model usage.</p>
                                        </label>
                                        <label className="space-y-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Maximum Next Actions</span>
                                            <input type="number" min={1} max={5} value={directorRuntimeSettings.nextActionLimit} onChange={(event) => setDirectorRuntimeSettings((settings) => ({ ...settings, nextActionLimit: Math.max(1, Math.min(5, Number(event.target.value) || 1)) }))} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-primary" />
                                            <p className="text-xs text-white/35">Limits the number of contextual options shown after an agent response.</p>
                                        </label>
                                    </div>

                                    <div>
                                        <h3 className="text-sm font-bold text-white">Specialist Instructions</h3>
                                        <p className="mt-1 text-xs leading-5 text-white/35">These instructions are injected into every Director run alongside the selected production workflow.</p>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        {specialistInstructionKeys.map((key) => (
                                            <label key={key} className="space-y-2">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{key} specialist</span>
                                                <textarea value={directorRuntimeSettings.specialists[key]} onChange={(event) => setDirectorRuntimeSettings((settings) => ({ ...settings, specialists: { ...settings.specialists, [key]: event.target.value } }))} rows={5} className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-primary" />
                                            </label>
                                        ))}
                                    </div>

                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        {directorRuntimeSettingsMessage ? <p className="text-sm text-white/50">{directorRuntimeSettingsMessage}</p> : <span />}
                                        <button type="button" onClick={handleSaveDirectorRuntimeSettings} disabled={isSavingDirectorRuntimeSettings} className="btn-primary flex shrink-0 items-center gap-2 px-5 py-3 disabled:opacity-60">
                                            {isSavingDirectorRuntimeSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            {isSavingDirectorRuntimeSettings ? "Saving..." : "Save Orchestration Settings"}
                                        </button>
                                    </div>

                                    <div className="border-t border-white/10 pt-6">
                                        <h3 className="text-sm font-bold text-white">Agent Team</h3>
                                        <p className="mt-1 text-xs leading-5 text-white/35">Named production agents the Director leads. The skills and instructions of each agent are sent to both the chat and voice Director on every run; workflow steps are attributed to the agent that owns the tool being used.</p>
                                    </div>
                                    <div className="space-y-4">
                                        {directorAgentKeys.map((key) => (
                                            <div key={key} className={`rounded-2xl border p-5 space-y-3 ${directorTeam[key].enabled ? "border-white/10 bg-black/20" : "border-white/5 bg-black/10 opacity-60"}`}>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <input
                                                        value={directorTeam[key].name}
                                                        onChange={(event) => setDirectorTeam((team) => ({ ...team, [key]: { ...team[key], name: event.target.value } }))}
                                                        className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-primary"
                                                    />
                                                    <label className="flex items-center gap-2 text-xs text-white/50">
                                                        <input
                                                            type="checkbox"
                                                            checked={directorTeam[key].enabled}
                                                            onChange={(event) => setDirectorTeam((team) => ({ ...team, [key]: { ...team[key], enabled: event.target.checked } }))}
                                                            className="h-4 w-4 accent-[#b9f42e]"
                                                        />
                                                        Enabled
                                                    </label>
                                                </div>
                                                <label className="block space-y-1.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Skills</span>
                                                    <input
                                                        value={directorTeam[key].skills}
                                                        onChange={(event) => setDirectorTeam((team) => ({ ...team, [key]: { ...team[key], skills: event.target.value } }))}
                                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white outline-none focus:border-primary"
                                                        placeholder="One line describing what this agent is for"
                                                    />
                                                </label>
                                                <label className="block space-y-1.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Instructions</span>
                                                    <textarea
                                                        value={directorTeam[key].instructions}
                                                        onChange={(event) => setDirectorTeam((team) => ({ ...team, [key]: { ...team[key], instructions: event.target.value } }))}
                                                        rows={4}
                                                        className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-primary"
                                                    />
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        {directorTeamMessage ? <p className="text-sm text-white/50">{directorTeamMessage}</p> : <span />}
                                        <button type="button" onClick={handleSaveDirectorTeam} disabled={isSavingDirectorTeam} className="btn-primary flex shrink-0 items-center gap-2 px-5 py-3 disabled:opacity-60">
                                            {isSavingDirectorTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            {isSavingDirectorTeam ? "Saving..." : "Save Agent Team"}
                                        </button>
                                    </div>
                                </div>

                                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-5">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-white/55">
                                            Project-default workflows apply to every episode automatically. Episode workflows can be selected later to override the default for one episode.
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addDirectorWorkflow}
                                            className="btn-primary flex shrink-0 items-center gap-2 px-4 py-3"
                                        >
                                            <Plus className="h-4 w-4" /> Add Workflow
                                        </button>
                                    </div>

                                    {directorWorkflows.map((workflow, index) => (
                                        <div key={workflow.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/40">#{index + 1}</span>
                                                        <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider", workflow.status === "active" ? "bg-lime-400/10 text-lime-300" : "bg-amber-400/10 text-amber-300")}>
                                                            {workflow.status}
                                                        </span>
                                                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                                                            {workflow.appliesTo === "episode" ? "Episode override" : "Project default"}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 font-mono text-xs text-white/30">{workflow.id}</p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateDirectorWorkflow(workflow.id, { status: workflow.status === "active" ? "paused" : "active" })}
                                                        className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/60 hover:bg-white/10"
                                                    >
                                                        {workflow.status === "active" ? "Pause" : "Activate"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteDirectorWorkflow(workflow.id)}
                                                        className="rounded-xl border border-red-500/20 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <label className="space-y-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Workflow Title</span>
                                                    <input
                                                        value={workflow.title}
                                                        onChange={(event) => updateDirectorWorkflow(workflow.id, { title: event.target.value })}
                                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-primary"
                                                    />
                                                </label>
                                                <label className="space-y-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Workflow ID</span>
                                                    <input
                                                        value={workflow.id}
                                                        onChange={(event) => updateDirectorWorkflow(workflow.id, { id: event.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || workflow.id })}
                                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-white outline-none focus:border-primary"
                                                    />
                                                </label>
                                                <label className="space-y-2 md:col-span-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Short Description</span>
                                                    <textarea
                                                        value={workflow.description}
                                                        onChange={(event) => updateDirectorWorkflow(workflow.id, { description: event.target.value })}
                                                        rows={2}
                                                        className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-primary"
                                                    />
                                                </label>
                                                <label className="space-y-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Skill Activated</span>
                                                    <textarea
                                                        value={workflow.skill}
                                                        onChange={(event) => updateDirectorWorkflow(workflow.id, { skill: event.target.value })}
                                                        rows={4}
                                                        className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-primary"
                                                        placeholder="Character continuity, storyboard image generation, video reference workflow..."
                                                    />
                                                </label>
                                                <label className="space-y-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Apply Scope</span>
                                                    <select
                                                        value={workflow.appliesTo}
                                                        onChange={(event) => updateDirectorWorkflow(workflow.id, { appliesTo: event.target.value === "episode" ? "episode" : "project_default" })}
                                                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-primary"
                                                    >
                                                        <option value="project_default">Project default: applies to all episodes</option>
                                                        <option value="episode">Episode override: selectable per episode</option>
                                                    </select>
                                                    <p className="text-xs leading-5 text-white/35">Studio settings can change the selected workflow any time. Project defaults carry to other episodes automatically.</p>
                                                </label>
                                                <label className="space-y-2 md:col-span-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Workflow Instructions</span>
                                                    <textarea
                                                        value={workflow.instructions}
                                                        onChange={(event) => updateDirectorWorkflow(workflow.id, { instructions: event.target.value })}
                                                        rows={6}
                                                        className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-primary"
                                                        placeholder="Tell the AI Director how to use characters, storyboard shots, image generation, video generation, approvals, references, and continuity..."
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    ))}

                                    {directorWorkflowsMessage && <p className="text-sm text-white/50">{directorWorkflowsMessage}</p>}

                                    <button
                                        onClick={handleSaveDirectorWorkflows}
                                        disabled={isSavingDirectorWorkflows}
                                        className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-60"
                                    >
                                        {isSavingDirectorWorkflows ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {isSavingDirectorWorkflows ? "Saving..." : "Save Workflow Instructions"}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === "site-features" && (
                            <motion.div
                                key="site-features"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <header>
                                    <h1 className="text-3xl font-bold tracking-tight mb-2">Pause Features & Navigation</h1>
                                    <p className="text-white/40 text-sm">Pause any platform feature tab. Once paused, it immediately stops showing in the main page navigation bar.</p>
                                </header>

                                <div className="glass-card p-6 rounded-2xl border-white/10 space-y-4 max-w-4xl">
                                    {[
                                        { key: "calendar" as const, label: "Calendar", path: "/calendar", desc: "Content Calendar & Post Scheduler" },
                                        { key: "analytics" as const, label: "Analytics", path: "/analytics", desc: "Social Media & Video Analytics Dashboard" },
                                        { key: "ads" as const, label: "Ads Manager", path: "/ads", desc: "Meta & LinkedIn Ad Campaign Manager" },
                                        { key: "competitors" as const, label: "Competitors", path: "/competitors", desc: "Competitor Intelligence & Ad Radar" },
                                        { key: "social" as const, label: "Social", path: "/social", desc: "Social Media Accounts & Publishing" },
                                        { key: "courses" as const, label: "Courses", path: "/courses", desc: "Public Courses Listing Section" },
                                        { key: "blog" as const, label: "Blog", path: "/blog", desc: "Blog Articles & Guides" },
                                    ].map((feat) => {
                                        const isPaused = !siteFeatures[feat.key]
                                        return (
                                            <div key={feat.key} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <p className="font-bold text-base">{feat.label}</p>
                                                        <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", isPaused ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30")}>
                                                            {isPaused ? "Paused" : "Active"}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-xs text-white/40">{feat.desc} • <span className="font-mono text-primary">{feat.path}</span></p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleSiteFeature(feat.key)}
                                                        className={cn(
                                                            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition",
                                                            isPaused
                                                                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                                                                : "border border-amber-500/30 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                                                        )}
                                                    >
                                                        {isPaused ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
                                                        {isPaused ? "Resume Feature" : "Pause Feature"}
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/45">
                                        Paused features are immediately removed from the top navigation bar for all regular users.
                                    </div>

                                    {siteFeaturesMessage && <p className="text-sm font-bold text-primary">{siteFeaturesMessage}</p>}

                                    <button
                                        onClick={handleSaveSiteFeatures}
                                        disabled={isSavingSiteFeatures}
                                        className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-60"
                                    >
                                        {isSavingSiteFeatures ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {isSavingSiteFeatures ? "Saving..." : "Save Feature Pause Settings"}
                                    </button>
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
                                                {mockChallenges.find(c => c.id === watchingChallengeId)?.submissions.find(s => s.id === watchingSubmissionId)?.studentName}&apos;s Submission
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
                                        {mockChallenges.find(c => c.id === watchingChallengeId)?.submissions.find(s => s.id === watchingSubmissionId)?.videoUrl ? (
                                            <video
                                                src={mockChallenges.find(c => c.id === watchingChallengeId)?.submissions.find(s => s.id === watchingSubmissionId)?.videoUrl}
                                                controls
                                                autoPlay
                                                className="w-full h-full"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center gap-3 text-white/30">
                                                <Video className="w-10 h-10" />
                                                <p className="text-sm">No submission video available</p>
                                            </div>
                                        )}
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
    const [uploadingLessonId, setUploadingLessonId] = useState<number | null>(null)
    const [lessonUploadStatus, setLessonUploadStatus] = useState("")
    const [uploadingResourceLessonId, setUploadingResourceLessonId] = useState<number | null>(null)
    const maxLessonVideoSize = 500 * 1024 * 1024
    const lessonVideoLimitMessage = "Supabase rejected this file. The videos bucket is set to 500 MB, but your project Storage global limit is still lower. In Supabase Dashboard, raise Storage Settings > Global file size limit, or paste a hosted video URL."

    const handleAddLesson = () => {
        const newLesson = {
            id: lessons.length + 1,
            title: "New Lesson",
            duration: "10:00",
            videoUrl: "",
            resources: [],
            description: "",
            takeaways: [] as string[],
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

    const handleUploadResource = async (lessonId: number, file: File) => {
        if (!file) return
        setUploadingResourceLessonId(lessonId)
        setLessonUploadStatus(`Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`)
        try {
            const { getServiceRequestClient } = await import('@/lib/service-requests')
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error('No client')
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
            const path = `resources/${Date.now()}-${safeName}`
            const { error } = await supabase.storage.from('materials').upload(path, file, { upsert: false })
            if (error) throw error
            const { data } = supabase.storage.from('materials').getPublicUrl(path)
            setLessons((prev: any[]) => prev.map((l: any) => l.id === lessonId
                ? { ...l, resources: [...l.resources, { name: file.name, url: data.publicUrl }] }
                : l))
            setLessonUploadStatus("✓ Material uploaded!")
            setTimeout(() => setLessonUploadStatus(""), 3000)
        } catch (err: any) {
            setLessonUploadStatus(`✗ Upload failed: ${String(err.message || 'Unknown error')}`)
            setTimeout(() => setLessonUploadStatus(""), 5000)
        }
        setUploadingResourceLessonId(null)
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
                    onClick={async () => {
                        try {
                            await onUpdate(lessons)
                            onBack()
                        } catch (err) {
                            // error already alerted in handleUpdateChapters
                        }
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
                                                <label className={cn("cursor-pointer group/upload", uploadingLessonId === lesson.id && "pointer-events-none opacity-50")}>
                                                    <input
                                                        type="file"
                                                        accept="video/*"
                                                        className="hidden"
                                                        onChange={async (e: any) => {
                                                            const file = e.target.files?.[0]
                                                            if (!file) return
                                                            if (file.size > maxLessonVideoSize) {
                                                                setLessonUploadStatus("✗ Upload failed: videos must be 500 MB or smaller")
                                                                setTimeout(() => setLessonUploadStatus(""), 5000)
                                                                e.target.value = ''
                                                                return
                                                            }
                                                            setUploadingLessonId(lesson.id)
                                                            setLessonUploadStatus(`Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`)
                                                            try {
                                                                const { getServiceRequestClient } = await import('@/lib/service-requests')
                                                                const supabase = await getServiceRequestClient()
                                                                if (!supabase) throw new Error('No client')
                                                                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
                                                                const path = `lessons/${Date.now()}-${safeName}`
                                                                const { error } = await supabase.storage.from('videos').upload(path, file, { upsert: false })
                                                                if (error) throw error
                                                                const { data } = supabase.storage.from('videos').getPublicUrl(path)
                                                                handleUpdateLesson(lesson.id, "videoUrl", data.publicUrl)
                                                                setLessonUploadStatus("✓ Video uploaded!")
                                                                setTimeout(() => setLessonUploadStatus(""), 3000)
                                                            } catch (err: any) {
                                                                const message = String(err.message || 'Unknown error')
                                                                const isSizeLimitError = message.toLowerCase().includes('maximum allowed size')
                                                                setLessonUploadStatus(`✗ Upload failed: ${isSizeLimitError ? lessonVideoLimitMessage : message}`)
                                                                setTimeout(() => setLessonUploadStatus(""), isSizeLimitError ? 12000 : 5000)
                                                            }
                                                            setUploadingLessonId(null)
                                                            e.target.value = ''
                                                        }}
                                                    />
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-white/40 group-hover/upload:bg-primary/20 group-hover/upload:text-primary transition-all whitespace-nowrap">
                                                        {uploadingLessonId === lesson.id ? (
                                                            <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</>
                                                        ) : (
                                                            <><Video className="w-3 h-3" /> Upload</>
                                                        )}
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

                        {uploadingLessonId === lesson.id && lessonUploadStatus && (
                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="ml-12 flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                                <span className="text-xs font-medium text-primary">{lessonUploadStatus}</span>
                            </motion.div>
                        )}
                        {uploadingLessonId === null && lessonUploadStatus && lessonUploadStatus.startsWith('✓') && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="ml-12 flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                <span className="text-xs font-medium text-emerald-400">{lessonUploadStatus}</span>
                            </motion.div>
                        )}
                        {uploadingLessonId === null && lessonUploadStatus && lessonUploadStatus.startsWith('✗') && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="ml-12 flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <span className="text-xs font-medium text-red-400">{lessonUploadStatus}</span>
                            </motion.div>
                        )}

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
                                            placeholder="File name"
                                        />
                                        <input
                                            value={resource.url === "#" ? "" : resource.url}
                                            onChange={(e) => {
                                                const newResources = [...lesson.resources]
                                                newResources[rIndex] = { ...resource, url: e.target.value || "#" }
                                                handleUpdateLesson(lesson.id, "resources", newResources)
                                            }}
                                            className="bg-transparent border-l border-white/10 pl-2 text-[10px] text-white/50 focus:outline-none focus:text-white min-w-[120px]"
                                            placeholder="Paste link / URL"
                                        />
                                        <button onClick={() => handleDeleteResource(lesson.id, rIndex)} className="text-white/20 hover:text-red-400">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <label className={cn("cursor-pointer", uploadingResourceLessonId === lesson.id && "pointer-events-none opacity-50")}>
                                    <input
                                        type="file"
                                        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.csv,image/*"
                                        className="hidden"
                                        onChange={async (e: any) => {
                                            const file = e.target.files?.[0]
                                            if (file) await handleUploadResource(lesson.id, file)
                                            e.target.value = ''
                                        }}
                                    />
                                    <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition-all">
                                        {uploadingResourceLessonId === lesson.id ? (
                                            <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</>
                                        ) : (
                                            <><Plus className="w-3 h-3" /> Add Material</>
                                        )}
                                    </div>
                                </label>
                                <button
                                    onClick={() => handleAddResource(lesson.id)}
                                    className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-bold text-white/40 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <Plus className="w-3 h-3" /> Add link
                                </button>
                            </div>
                        </div>

                        {/* About this Lesson */}
                        <div className="pl-12 space-y-2">
                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">About this Lesson</p>
                            <textarea
                                value={lesson.description || ''}
                                onChange={(e) => handleUpdateLesson(lesson.id, "description", e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-xs focus:outline-none focus:border-primary resize-none"
                                rows={3}
                                placeholder="Describe what students will learn in this lesson..."
                            />
                        </div>

                        {/* Key Takeaways */}
                        <div className="pl-12 space-y-2">
                            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Key Takeaways</p>
                            <div className="space-y-2">
                                {(lesson.takeaways || []).map((t: string, tIdx: number) => (
                                    <div key={tIdx} className="flex items-center gap-2">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                        <input
                                            value={t}
                                            onChange={(e) => {
                                                const updated = [...(lesson.takeaways || [])]
                                                updated[tIdx] = e.target.value
                                                handleUpdateLesson(lesson.id, "takeaways", updated)
                                            }}
                                            className="flex-grow bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] focus:outline-none focus:border-primary"
                                            placeholder="Takeaway point"
                                        />
                                        <button
                                            onClick={() => {
                                                const updated = [...(lesson.takeaways || [])]
                                                updated.splice(tIdx, 1)
                                                handleUpdateLesson(lesson.id, "takeaways", updated)
                                            }}
                                            className="text-white/20 hover:text-red-400"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => handleUpdateLesson(lesson.id, "takeaways", [...(lesson.takeaways || []), ""])}
                                    className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all"
                                >
                                    <Plus className="w-3 h-3" /> Add Takeaway
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
