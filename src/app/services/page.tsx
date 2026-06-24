"use client"

import Navbar from "@/components/Navbar"
import { motion, AnimatePresence } from "framer-motion"
import { BriefcaseBusiness, Send, Clock, DollarSign, MessageSquare, CheckCircle2, Loader2, UserCheck, Mail, Phone, Bell, Trophy, X, Search, SlidersHorizontal, Coins, Plus, Minus } from "lucide-react"
import { FormEvent, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import {
    createServiceBid,
    createServiceRequest,
    fetchApprovedJobs,
    fetchMyServiceJobs,
    getServiceRequestClient,
    selectServiceBid,
    updateServiceBid,
    type ServiceBid,
    type ServiceRequest,
} from "@/lib/service-requests"
import Link from "next/link"
// @ts-ignore
import confetti from "canvas-confetti"

const jobTypes = ["AI Video Production", "AI Ad Creative", "AI Music Video", "AI Short Film", "AI Storyboard"]

const emptyJobForm = {
    title: "",
    fullName: "",
    email: "",
    phone: "",
    serviceType: "AI Video Production",
    projectDescription: "",
    budgetRange: "",
    timeline: "",
}

const emptyBidForm = {
    bidderName: "",
    bidderEmail: "",
    bidderPhone: "",
    offerAmount: "",
    message: "",
}

const BID_COST = 2 // bids charged per job bid
const PRICE_PER_BID = 10 // ₹ per bid

export default function ServicesPage() {
    const { user, signInWithGoogle } = useAuth()
    const [jobs, setJobs] = useState<ServiceRequest[]>([])
    const [myPostedJobs, setMyPostedJobs] = useState<ServiceRequest[]>([])
    const [jobForm, setJobForm] = useState(emptyJobForm)
    const [bidForm, setBidForm] = useState(emptyBidForm)
    const [selectedJob, setSelectedJob] = useState<ServiceRequest | null>(null)
    const [editingBid, setEditingBid] = useState<ServiceBid | null>(null)
    const [showJobForm, setShowJobForm] = useState(false)
    const [isLoadingJobs, setIsLoadingJobs] = useState(true)
    const [isPostingJob, setIsPostingJob] = useState(false)
    const [isSubmittingBid, setIsSubmittingBid] = useState(false)
    const [showBidSuccess, setShowBidSuccess] = useState(false)
    const [message, setMessage] = useState("")
    const [searchQuery, setSearchQuery] = useState("")
    const [activeFeedTab, setActiveFeedTab] = useState<"best" | "recent" | "proposals" | "posted">("best")
    const [bids, setBids] = useState<number | null>(null)
    const [showBuyBids, setShowBuyBids] = useState(false)
    const [buyQty, setBuyQty] = useState(10)
    const [isBuyingBids, setIsBuyingBids] = useState(false)
    const knownJobIdsRef = useRef<Set<string>>(new Set())
    const hasLoadedJobsRef = useRef(false)
    useEffect(() => {
        loadJobs()
        const interval = window.setInterval(() => loadJobs(true), 30000)
        return () => window.clearInterval(interval)
    }, [])

    useEffect(() => {
        if (!user) return
        setJobForm((current) => ({
            ...current,
            fullName: current.fullName || user.user_metadata?.full_name || "",
            email: current.email || user.email || "",
        }))
        setBidForm((current) => ({
            ...current,
            bidderName: current.bidderName || user.user_metadata?.full_name || "",
            bidderEmail: current.bidderEmail || user.email || "",
        }))
        loadJobs()
        loadMyPostedJobs(user.id)
        loadBids(user.id)
    }, [user])

    const loadBids = async (userId: string) => {
        const supabase = await getServiceRequestClient()
        if (!supabase) return
        const { data } = await supabase.from("profiles").select("bids").eq("id", userId).single()
        setBids(data?.bids ?? 0)
    }

    const loadRazorpayScript = () =>
        new Promise<boolean>((resolve) => {
            if (typeof window !== "undefined" && (window as any).Razorpay) return resolve(true)
            const script = document.createElement("script")
            script.src = "https://checkout.razorpay.com/v1/checkout.js"
            script.onload = () => resolve(true)
            script.onerror = () => resolve(false)
            document.body.appendChild(script)
        })

    const handleBuyBids = async () => {
        if (!user) { signInWithGoogle(); return }
        setIsBuyingBids(true)
        try {
            const ok = await loadRazorpayScript()
            if (!ok) throw new Error("Failed to load payment gateway.")
            const res = await fetch("/api/razorpay/bids", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bids: buyQty }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || "Could not start purchase.")

            const rzp = new (window as any).Razorpay({
                key: data.keyId,
                order_id: data.orderId,
                amount: data.amount,
                name: "AI Director Hub",
                description: `${data.bids} bids`,
                prefill: { name: data.name, email: data.email },
                theme: { color: "#C4F52B" },
                handler: async () => {
                    // Webhook credits the bids; poll a moment then refresh balance.
                    setShowBuyBids(false)
                    setTimeout(() => user && loadBids(user.id), 4000)
                    setMessage("Payment received — bids will be added shortly.")
                },
                modal: { ondismiss: () => setIsBuyingBids(false) },
            })
            rzp.open()
        } catch (e: any) {
            setMessage(e?.message || "Could not start purchase.")
            setIsBuyingBids(false)
        }
    }

    const loadJobs = async (silent = false) => {
        if (!silent) setIsLoadingJobs(true)
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            const nextJobs = await fetchApprovedJobs(supabase)
            const nextIds = new Set(nextJobs.map((job) => job.id))
            const hasNewJobs = hasLoadedJobsRef.current && nextJobs.some((job) => !knownJobIdsRef.current.has(job.id))

            knownJobIdsRef.current = nextIds
            hasLoadedJobsRef.current = true
            setJobs(nextJobs)
            if (hasNewJobs) {
                setMessage("New approved job posted.")
            }
        } finally {
            if (!silent) setIsLoadingJobs(false)
        }
    }

    const loadMyPostedJobs = async (userId: string) => {
        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) return
            setMyPostedJobs(await fetchMyServiceJobs(supabase, userId))
        } catch {
            setMyPostedJobs([])
        }
    }

    const handlePostJob = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!user) {
            signInWithGoogle()
            return
        }

        setIsPostingJob(true)
        setMessage("")

        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("Supabase unavailable")
            const fullName = jobForm.fullName.trim() || user.user_metadata?.full_name || "Student"
            const email = jobForm.email.trim() || user.email || ""

            await supabase.from("profiles").upsert({
                id: user.id,
                full_name: fullName,
                avatar_url: user.user_metadata?.avatar_url || "",
                email,
            }, { onConflict: "id" })

            const postedJob = await createServiceRequest(supabase, {
                posterId: user.id,
                ...jobForm,
                fullName,
                email,
            })
            setMyPostedJobs((current) => [postedJob, ...current])
            setJobForm({
                ...emptyJobForm,
                fullName: user.user_metadata?.full_name || "",
                email: user.email || "",
            })
            setShowJobForm(false)
            setMessage("Job submitted for admin approval.")
        } catch {
            setMessage("Could not post this job. Please try again.")
        } finally {
            setIsPostingJob(false)
        }
    }

    const openBid = (job: ServiceRequest) => {
        if (!user) {
            signInWithGoogle()
            return
        }
        const existingBid = job.bids.find((bid) => bid.bidderId === user.id) || null
        if (existingBid) {
            setEditingBid(existingBid)
            setBidForm({
                bidderName: existingBid.bidderName,
                bidderEmail: existingBid.bidderEmail,
                bidderPhone: existingBid.bidderPhone,
                offerAmount: existingBid.offerAmount,
                message: existingBid.message,
            })
        } else {
            setEditingBid(null)
            setBidForm({
                ...emptyBidForm,
                bidderName: user.user_metadata?.full_name || "",
                bidderEmail: user.email || "",
            })
        }
        setSelectedJob(job)
        setMessage("")
    }

    const handleSubmitBid = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!user || !selectedJob) return

        setIsSubmittingBid(true)
        setMessage("")

        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("Supabase unavailable")
            const bidderName = bidForm.bidderName.trim() || user.user_metadata?.full_name || "Creator"
            const bidderEmail = bidForm.bidderEmail.trim() || user.email || ""

            await supabase.from("profiles").upsert({
                id: user.id,
                full_name: bidderName,
                avatar_url: user.user_metadata?.avatar_url || "",
                email: bidderEmail,
            }, { onConflict: "id" })

            // New bids cost BID_COST bids; editing an existing bid is free.
            if (!editingBid) {
                const { data: spent } = await supabase.rpc("spend_bids", { p_cost: BID_COST })
                if (!spent) {
                    setMessage(`You need ${BID_COST} bids to bid on a job. Buy more bids to continue.`)
                    setIsSubmittingBid(false)
                    setSelectedJob(null)
                    setShowBuyBids(true)
                    return
                }
                if (user) loadBids(user.id)
            }

            const bid = editingBid
                ? await updateServiceBid(supabase, editingBid.id, {
                    ...bidForm,
                    bidderName,
                    bidderEmail,
                })
                : await createServiceBid(supabase, {
                    jobId: selectedJob.id,
                    bidderId: user.id,
                    ...bidForm,
                    bidderName,
                    bidderEmail,
                })
            setJobs((current) => current.map((job) => (
                job.id === selectedJob.id
                    ? {
                        ...job,
                        bids: editingBid
                            ? job.bids.map((currentBid) => currentBid.id === bid.id ? bid : currentBid)
                            : [bid, ...job.bids],
                    }
                    : job
            )))
            setSelectedJob(null)
            setEditingBid(null)
            setBidForm({
                ...emptyBidForm,
                bidderName: user.user_metadata?.full_name || "",
                bidderEmail: user.email || "",
            })
            setMessage(editingBid ? "Bid proposal updated." : "Bid sent to the job poster.")
            setShowBidSuccess(true)
            confetti({
                particleCount: 80,
                spread: 60,
                origin: { y: 0.72 },
                colors: ['#C4F52B', '#06b6d4', '#22c55e']
            })
            setTimeout(() => setShowBidSuccess(false), 2400)
        } catch {
            setMessage(editingBid ? "Could not update your bid. Please try again." : "Could not send your bid. Please try again.")
        } finally {
            setIsSubmittingBid(false)
        }
    }

    const handleSelectBid = async (job: ServiceRequest, bid: ServiceBid) => {
        if (!user || user.id !== job.posterId) return

        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) throw new Error("Supabase unavailable")

            await selectServiceBid(supabase, job.id, bid.id)
            const markAwarded = (currentJob: ServiceRequest): ServiceRequest => (
                currentJob.id === job.id
                    ? {
                        ...currentJob,
                        status: "awarded",
                        selectedBidId: bid.id,
                        bids: currentJob.bids.map((currentBid) => ({
                            ...currentBid,
                            status: currentBid.id === bid.id ? "selected" as const : "rejected" as const,
                        })),
                    }
                    : currentJob
            )

            setJobs((current) => current.map(markAwarded))
            setMyPostedJobs((current) => current.map(markAwarded))
            setMessage("Creator selected. Contact details are now visible on the job.")
        } catch {
            setMessage("Could not select this creator.")
        }
    }

    const myBidProposals = user
        ? jobs.flatMap((job) => job.bids
            .filter((bid) => bid.bidderId === user.id)
            .map((bid) => ({ job, bid })))
        : []

    const searchedJobs = jobs.filter((job) => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return true
        return [
            job.title,
            job.serviceType,
            job.projectDescription,
            job.budgetRange,
            job.timeline,
        ].some((value) => value.toLowerCase().includes(query))
    })
    const recentJobs = [...searchedJobs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const proposalJobs = user ? searchedJobs.filter((job) => job.bids.some((bid) => bid.bidderId === user.id)) : []
    const postedFeedJobs = user ? myPostedJobs.filter((job) => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return true
        return [job.title, job.serviceType, job.projectDescription, job.budgetRange, job.timeline].some((value) => value.toLowerCase().includes(query))
    }) : []
    const feedJobs = activeFeedTab === "recent"
        ? recentJobs
        : activeFeedTab === "proposals"
            ? proposalJobs
            : activeFeedTab === "posted"
                ? postedFeedJobs
                : searchedJobs

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            <section className="pt-32 px-6 max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-10">
                    <div className="space-y-4 max-w-2xl">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-xs font-bold text-primary uppercase tracking-widest"
                        >
                            <Bell className="w-3.5 h-3.5" /> New approved jobs appear here
                        </motion.div>
                        <motion.h1
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl md:text-5xl font-bold tracking-tight"
                        >
                            AI Video <span className="text-primary">Jobs</span>
                        </motion.h1>
                        <p className="text-white/60 leading-relaxed">
                            Post AI video projects, review creator bids, and pick the right person to work with. Admins approve every job before it goes live.
                        </p>
                        {user && (
                            <div className="mt-4 flex flex-wrap items-center gap-3 p-4 bg-amber-400/5 border border-amber-400/20 rounded-xl">
                                <div className="flex items-center gap-2">
                                    <Coins className="w-5 h-5 text-amber-400" />
                                    <span className="text-lg font-black">{bids ?? "—"}</span>
                                    <span className="text-xs text-white/40 font-bold uppercase tracking-widest">Bids</span>
                                </div>
                                <span className="text-xs text-white/35">Each job bid costs {BID_COST} bids.</span>
                                <button
                                    onClick={() => { setBuyQty(10); setShowBuyBids(true) }}
                                    className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-amber-400 text-black rounded-lg text-sm font-bold hover:bg-amber-300 transition-colors"
                                >
                                    <Plus className="w-4 h-4" /> Buy Bids
                                </button>
                            </div>
                        )}
                        <div className="mt-4 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                            <p className="text-sm text-white/70"><strong className="text-primary">Need professional AI video services?</strong> Our AI services are priced on a custom-quote basis — pricing varies per project scope and requirements.</p>
                            <Link href="/contact" className="inline-flex items-center gap-2 mt-3 px-5 py-2 bg-primary rounded-lg text-sm font-bold hover:bg-primary/80 transition-colors">
                                Request a Quote
                            </Link>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="glass-card px-5 py-4 rounded-xl border-white/10">
                            <p className="text-2xl font-black">{jobs.length}</p>
                            <p className="text-[10px] text-white/35 font-bold uppercase tracking-widest">Live Jobs</p>
                        </div>
                        <div className="glass-card px-5 py-4 rounded-xl border-white/10">
                            <p className="text-2xl font-black">{jobs.reduce((sum, job) => sum + job.bids.length, 0)}</p>
                            <p className="text-[10px] text-white/35 font-bold uppercase tracking-widest">Bids</p>
                        </div>
                        <div className="glass-card px-5 py-4 rounded-xl border-white/10">
                            <p className="text-2xl font-black">{jobs.filter(job => job.status === "awarded").length}</p>
                            <p className="text-[10px] text-white/35 font-bold uppercase tracking-widest">Awarded</p>
                        </div>
                    </div>
                </div>

                {message && (
                    <div className="mb-8 glass-card p-4 rounded-xl border-white/10 text-sm text-white/60">
                        {message}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8 items-start">
                    <div className="space-y-5">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex flex-col md:flex-row md:items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 w-5 h-5 -translate-y-1/2 text-white/35" />
                                    <input
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-12 pr-4 text-sm outline-none transition-colors focus:border-primary/50"
                                        placeholder="Search AI video jobs"
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        if (!user) {
                                            signInWithGoogle()
                                            return
                                        }
                                        setShowJobForm(true)
                                    }}
                                    className="btn-primary px-5 py-3 flex items-center justify-center gap-2"
                                >
                                    <BriefcaseBusiness className="w-4 h-4" /> Post a Job
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 border-b border-white/10">
                            {[
                                { id: "best", label: "Best matches", count: jobs.length },
                                { id: "recent", label: "Most recent", count: jobs.length },
                                { id: "proposals", label: "My proposals", count: myBidProposals.length },
                                { id: "posted", label: "My posted jobs", count: myPostedJobs.length },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveFeedTab(tab.id as typeof activeFeedTab)}
                                    className={cn(
                                        "relative pb-4 text-sm font-bold transition-colors",
                                        activeFeedTab === tab.id ? "text-white" : "text-white/35 hover:text-white/70"
                                    )}
                                >
                                    {tab.label}
                                    {tab.count > 0 && (
                                        <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">{tab.count}</span>
                                    )}
                                    {activeFeedTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-white" />}
                                </button>
                            ))}
                        </div>

                        {isLoadingJobs ? (
                            <div className="glass-card p-12 text-center text-white/40">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                                Loading jobs...
                            </div>
                        ) : feedJobs.length === 0 ? (
                            <div className="glass-card p-12 text-center">
                                <BriefcaseBusiness className="w-12 h-12 text-white/20 mx-auto mb-4" />
                                <h2 className="text-2xl font-bold mb-2">No Jobs Found</h2>
                                <p className="text-white/40">Approved AI video projects and your activity will appear here.</p>
                            </div>
                        ) : (
                            feedJobs.map((job) => {
                                const isOwner = user?.id === job.posterId
                                const selectedBid = job.bids.find((bid) => bid.id === job.selectedBidId)

                                return (
                                    <article key={job.id} className="border-b border-white/10 py-7 first:pt-2 last:border-b-0">
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                                            <div>
                                                <p className="mb-3 text-xs text-white/35">Posted {new Date(job.createdAt).toLocaleDateString()}</p>
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <span className={cn(
                                                        "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                                                        job.status === "pending" ? "bg-lime-300/10 text-lime-200" :
                                                            job.status === "awarded" ? "bg-emerald-400/10 text-emerald-300" :
                                                                job.status === "approved" ? "bg-primary/10 text-primary" : "bg-white/5 text-white/40"
                                                    )}>
                                                        {job.status === "awarded" ? "Awarded" : job.status === "approved" ? "Open" : job.status}
                                                    </span>
                                                    <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 text-white/40">{job.serviceType}</span>
                                                </div>
                                                <h3 className="text-2xl font-bold">{job.title}</h3>
                                            </div>
                                            <button onClick={() => openBid(job)} disabled={job.status !== "approved" || isOwner} className="btn-primary px-6 py-3 flex items-center justify-center gap-2 disabled:opacity-40">
                                                <MessageSquare className="w-4 h-4" /> {job.bids.some((bid) => bid.bidderId === user?.id) ? "Edit Bid" : "Bid"}
                                            </button>
                                        </div>

                                        <p className="text-white/60 leading-relaxed whitespace-pre-wrap">{job.projectDescription}</p>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Budget</p>
                                                <p className="font-bold">{job.budgetRange}</p>
                                            </div>
                                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Timeline</p>
                                                <p className="font-bold">{job.timeline}</p>
                                            </div>
                                            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                                                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 flex items-center gap-1"><UserCheck className="w-3 h-3" /> Bids</p>
                                                <p className="font-bold">{job.bids.length}</p>
                                            </div>
                                        </div>

                                        {isOwner && job.bids.length > 0 && (
                                            <div className="pt-5 border-t border-white/5 space-y-3">
                                                <h4 className="text-xs font-bold text-white/30 uppercase tracking-widest">Creator Bids</h4>
                                                {job.bids.map((bid) => (
                                                    <div key={bid.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                            <div>
                                                                <p className="font-bold">{bid.bidderName}</p>
                                                                <p className="text-xs text-white/40">{bid.offerAmount}</p>
                                                            </div>
                                                            <button onClick={() => handleSelectBid(job, bid)} disabled={job.status === "awarded"} className="px-4 py-2 rounded-xl bg-primary text-sm font-bold disabled:opacity-40">
                                                                {bid.status === "selected" ? "Selected" : "Select Creator"}
                                                            </button>
                                                        </div>
                                                        <p className="text-sm text-white/60 whitespace-pre-wrap">{bid.message}</p>
                                                        {(bid.status === "selected" || job.selectedBidId === bid.id) && (
                                                            <div className="flex flex-wrap gap-3 text-xs text-emerald-300">
                                                                <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {bid.bidderEmail}</span>
                                                                {bid.bidderPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {bid.bidderPhone}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {!isOwner && selectedBid?.bidderId === user?.id && (
                                            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                                <p className="font-bold text-emerald-300 flex items-center gap-2"><Trophy className="w-4 h-4" /> You won the interview!</p>
                                                <div className="flex flex-wrap gap-3 mt-3 text-xs text-emerald-200">
                                                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {job.email}</span>
                                                    {job.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {job.phone}</span>}
                                                </div>
                                                <Link href={`/messages?job=${job.id}`} className="mt-4 btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
                                                    <MessageSquare className="w-4 h-4" /> Chat with Client
                                                </Link>
                                            </div>
                                        )}

                                        {isOwner && job.status === "awarded" && selectedBid && (
                                            <Link href={`/messages?job=${job.id}`} className="btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4" /> Chat with {selectedBid.bidderName}
                                            </Link>
                                        )}
                                    </article>
                                )
                            })
                        )}
                    </div>

                    <aside className="space-y-6 lg:sticky lg:top-24">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <h3 className="text-xl font-bold">My Work Hub</h3>
                                <SlidersHorizontal className="w-5 h-5 text-white/35" />
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between rounded-xl bg-black/15 p-4">
                                    <div>
                                        <p className="text-sm font-bold">Active proposals</p>
                                        <p className="text-xs text-white/35">Bids you sent</p>
                                    </div>
                                    <span className="text-2xl font-black">{myBidProposals.length}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-xl bg-black/15 p-4">
                                    <div>
                                        <p className="text-sm font-bold">Posted jobs</p>
                                        <p className="text-xs text-white/35">Jobs you created</p>
                                    </div>
                                    <span className="text-2xl font-black">{myPostedJobs.length}</span>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <h3 className="text-lg font-bold">My Active Bid Proposals</h3>
                                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold">{myBidProposals.length}</span>
                            </div>
                            {myBidProposals.length === 0 ? (
                                <p className="text-sm text-white/35">Your submitted bids will appear here.</p>
                            ) : (
                                <div className="space-y-3">
                                    {myBidProposals.slice(0, 4).map(({ job, bid }) => (
                                        <div key={bid.id} className="rounded-xl border border-white/5 bg-black/15 p-4">
                                            <div className="mb-2 flex items-start justify-between gap-3">
                                                <p className="line-clamp-1 text-sm font-bold">{job.title}</p>
                                                <span className={cn(
                                                    "shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase",
                                                    bid.status === "selected" ? "bg-emerald-400/10 text-emerald-300" :
                                                        bid.status === "rejected" ? "bg-red-400/10 text-red-300" : "bg-primary/10 text-primary"
                                                )}>{bid.status}</span>
                                            </div>
                                            <p className="text-xs text-white/45">{bid.offerAmount}</p>
                                            <button
                                                onClick={() => openBid(job)}
                                                disabled={bid.status !== "pending" || job.status !== "approved"}
                                                className="mt-3 text-xs font-bold text-primary disabled:text-white/25"
                                            >
                                                Edit proposal
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <h3 className="text-lg font-bold">My Posted Jobs</h3>
                                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">{myPostedJobs.length}</span>
                            </div>
                            {myPostedJobs.length === 0 ? (
                                <p className="text-sm text-white/35">Jobs you post will appear here.</p>
                            ) : (
                                <div className="space-y-3">
                                    {myPostedJobs.slice(0, 4).map((job) => (
                                        <div key={job.id} className="rounded-xl border border-white/5 bg-black/15 p-4">
                                            <div className="mb-2 flex items-start justify-between gap-3">
                                                <p className="line-clamp-1 text-sm font-bold">{job.title}</p>
                                                <span className={cn(
                                                    "shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase",
                                                    job.status === "pending" ? "bg-lime-300/10 text-lime-200" :
                                                        job.status === "approved" ? "bg-primary/10 text-primary" :
                                                            job.status === "awarded" ? "bg-emerald-400/10 text-emerald-300" :
                                                                job.status === "rejected" ? "bg-red-400/10 text-red-300" : "bg-white/5 text-white/40"
                                                )}>{job.status}</span>
                                            </div>
                                            <p className="text-xs text-white/45">{job.bids.length} bid{job.bids.length === 1 ? "" : "s"} • {job.budgetRange || "No budget"}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </section>

            <AnimatePresence>
                {showJobForm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl" onClick={() => !isPostingJob && setShowJobForm(false)}>
                        <motion.form initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onSubmit={handlePostJob} className="bg-[#0f0f15] rounded-3xl border border-white/10 overflow-hidden w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">Post a Job</h3>
                                    <p className="text-xs text-white/40 mt-1">Jobs stay pending until admin approval.</p>
                                </div>
                                <button type="button" onClick={() => setShowJobForm(false)} disabled={isPostingJob} className="p-2 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all disabled:opacity-40">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Job Title</label>
                                    <input required value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="30-second AI product launch video" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input required value={jobForm.fullName} onChange={(e) => setJobForm({ ...jobForm, fullName: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Your name" />
                                    <input required type="email" value={jobForm.email} onChange={(e) => setJobForm({ ...jobForm, email: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Email" />
                                </div>

                                <input value={jobForm.phone} onChange={(e) => setJobForm({ ...jobForm, phone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Phone number" />

                                <select value={jobForm.serviceType} onChange={(e) => setJobForm({ ...jobForm, serviceType: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50">
                                    {jobTypes.map((type) => <option key={type} className="bg-[#1a1a2e]">{type}</option>)}
                                </select>

                                <textarea required rows={5} value={jobForm.projectDescription} onChange={(e) => setJobForm({ ...jobForm, projectDescription: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 resize-none" placeholder="Project brief, references, deliverables..." />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input required value={jobForm.budgetRange} onChange={(e) => setJobForm({ ...jobForm, budgetRange: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Budget, e.g. ₹10,000" />
                                    <input required value={jobForm.timeline} onChange={(e) => setJobForm({ ...jobForm, timeline: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Timeline, e.g. 7 days" />
                                </div>
                            </div>

                            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex flex-col sm:flex-row justify-end gap-3">
                                <button type="button" onClick={() => setShowJobForm(false)} disabled={isPostingJob} className="px-5 py-3 bg-white/5 rounded-xl text-sm font-bold hover:bg-white/10 transition-colors disabled:opacity-40">Cancel</button>
                                <button type="submit" disabled={isPostingJob} className="btn-primary py-3 px-6 flex items-center justify-center gap-2 disabled:opacity-60">
                                    {isPostingJob ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {isPostingJob ? "Submitting..." : "Submit for Approval"}
                                </button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showBidSuccess && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.96 }}
                        className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-6 py-4 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-full bg-emerald-400/20 p-2 text-emerald-300">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-bold text-emerald-200">Bid submitted</p>
                                <p className="text-xs text-emerald-100/70">Your proposal is now saved in active bids.</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {selectedJob && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl" onClick={() => !isSubmittingBid && setSelectedJob(null)}>
                        <motion.form initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onSubmit={handleSubmitBid} className="bg-[#0f0f15] rounded-3xl border border-white/10 overflow-hidden w-full max-w-xl shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold">{editingBid ? "Edit Bid Proposal" : "Bid for Job"}</h3>
                                    <p className="text-xs text-white/40 mt-1">{selectedJob.title}</p>
                                </div>
                                <button type="button" onClick={() => { setSelectedJob(null); setEditingBid(null) }} disabled={isSubmittingBid} className="p-2 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all disabled:opacity-40">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <input required value={bidForm.bidderName} onChange={(e) => setBidForm({ ...bidForm, bidderName: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Your name" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <input required type="email" value={bidForm.bidderEmail} onChange={(e) => setBidForm({ ...bidForm, bidderEmail: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Email" />
                                    <input value={bidForm.bidderPhone} onChange={(e) => setBidForm({ ...bidForm, bidderPhone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Phone" />
                                </div>
                                <input required value={bidForm.offerAmount} onChange={(e) => setBidForm({ ...bidForm, offerAmount: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50" placeholder="Your offer, e.g. ₹8,000 in 5 days" />
                                <textarea required rows={5} value={bidForm.message} onChange={(e) => setBidForm({ ...bidForm, message: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 resize-none" placeholder="Custom message, portfolio links, approach..." />
                            </div>

                            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between gap-3">
                                {!editingBid && (
                                    <span className="text-xs text-white/40 flex items-center gap-1.5">
                                        <Coins className="w-3.5 h-3.5 text-amber-400" /> Costs {BID_COST} bids · Balance: {bids ?? "—"}
                                    </span>
                                )}
                                <div className="flex justify-end gap-3 ml-auto">
                                <button type="button" onClick={() => { setSelectedJob(null); setEditingBid(null) }} disabled={isSubmittingBid} className="px-5 py-3 bg-white/5 rounded-xl text-sm font-bold hover:bg-white/10 transition-colors disabled:opacity-40">Cancel</button>
                                <button type="submit" disabled={isSubmittingBid} className="btn-primary flex items-center justify-center gap-2 px-6 py-3 disabled:opacity-60">
                                    {isSubmittingBid ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {isSubmittingBid ? "Saving..." : editingBid ? "Save Changes" : "Send Bid"}
                                </button>
                                </div>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Buy Bids Modal */}
            <AnimatePresence>
                {showBuyBids && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => !isBuyingBids && setShowBuyBids(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md glass-card rounded-2xl border-white/10 p-6 space-y-5"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold flex items-center gap-2"><Coins className="w-5 h-5 text-amber-400" /> Buy Bids</h3>
                                <button onClick={() => setShowBuyBids(false)} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
                            </div>
                            <p className="text-sm text-white/50">Bids are ₹{PRICE_PER_BID} each (10 bids = ₹{PRICE_PER_BID * 10}). Each job bid costs {BID_COST} bids.</p>

                            <div className="flex items-center justify-center gap-4">
                                <button
                                    onClick={() => setBuyQty((q) => Math.max(10, q - 10))}
                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
                                >
                                    <Minus className="w-4 h-4" />
                                </button>
                                <div className="text-center min-w-[120px]">
                                    <p className="text-4xl font-black">{buyQty}</p>
                                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Bids</p>
                                </div>
                                <button
                                    onClick={() => setBuyQty((q) => q + 10)}
                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2 justify-center">
                                {[10, 50, 100, 250].map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => setBuyQty(q)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                                            buyQty === q ? "bg-amber-400 text-black border-amber-400" : "bg-white/5 border-white/10 hover:bg-white/10"
                                        )}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                                <span className="text-sm text-white/50">Total</span>
                                <span className="text-2xl font-black">₹{buyQty * PRICE_PER_BID}</span>
                            </div>

                            <button
                                onClick={handleBuyBids}
                                disabled={isBuyingBids}
                                className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-60"
                            >
                                {isBuyingBids ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                                Pay ₹{buyQty * PRICE_PER_BID}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    )
}
