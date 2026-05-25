"use client"

import Navbar from "@/components/Navbar"
import { motion, AnimatePresence } from "framer-motion"
import { ShieldCheck, Zap, Sparkles, Send, Clock, DollarSign, MessageSquare, CheckCircle2, ChevronRight, FileText } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { createServiceRequest, getServiceRequestClient } from "@/lib/service-requests"

const services = [
    {
        title: "AI Video Production",
        desc: "End-to-end AI video creation for commercials, social media, and film.",
        icon: Zap,
        features: ["4K Resolution", "Custom Style", "Fast Turnaround"]
    },
    {
        title: "AI Scripting & Storyboarding",
        desc: "Generate compelling narratives and visual storyboards using advanced LLMs.",
        icon: FileText,
        features: ["Creative Synergy", "Beat Sheets", "Visual Hooks"]
    },
    {
        title: "AI Character Creation",
        desc: "Consistent 3D or 2D characters for your brand's digital presence.",
        icon: Sparkles,
        features: ["Consistency", "Expression Mapping", "Unique ID"]
    }
]

export default function ServicesPage() {
    const [step, setStep] = useState(1)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitMessage, setSubmitMessage] = useState("")
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        serviceType: "AI Video Production",
        projectDescription: "",
        budgetRange: "",
        timeline: "",
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setSubmitMessage("")

        try {
            const supabase = await getServiceRequestClient()
            if (!supabase) {
                setSubmitMessage("Supabase is not configured yet. Please try again later.")
                return
            }

            await createServiceRequest(supabase, formData)
            setIsSubmitted(true)
            setFormData({
                fullName: "",
                email: "",
                serviceType: "AI Video Production",
                projectDescription: "",
                budgetRange: "",
                timeline: "",
            })
            setStep(1)
        } catch (error) {
            setSubmitMessage("Could not save your request. Please check Supabase setup.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            <section className="pt-32 px-6 max-w-7xl mx-auto">
                <div className="text-center mb-16 space-y-4">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl md:text-6xl font-bold tracking-tight"
                    >
                        Premium AI <span className="text-primary">Services</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-white/60 max-w-2xl mx-auto"
                    >
                        Elevate your brand with cutting-edge AI video solutions. Whether it's a 15-second ad or a short film, our experts deliver results that wow.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20">
                    {services.map((service, i) => (
                        <motion.div
                            key={service.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="glass-card p-8 group border-white/5 hover:border-primary/20"
                        >
                            <div className="p-3 bg-primary/10 rounded-2xl w-fit mb-6 text-primary group-hover:bg-primary group-hover:text-white transition-all">
                                <service.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3">{service.title}</h3>
                            <p className="text-sm text-white/50 mb-6 leading-relaxed">{service.desc}</p>
                            <ul className="space-y-3 mb-8">
                                {service.features.map(f => (
                                    <li key={f} className="flex items-center gap-2 text-xs font-medium text-white/70">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> {f}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => {
                                    setStep(1)
                                    document.getElementById('request-form')?.scrollIntoView({ behavior: 'smooth' })
                                }}
                                className="w-full py-3 bg-white/5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors border border-white/10"
                            >
                                Inquire Now
                            </button>
                        </motion.div>
                    ))}
                </div>

                {/* Request Form Section */}
                <div id="request-form" className="max-w-3xl mx-auto">
                    <div className="glass-card p-8 md:p-12 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -z-10" />

                        <AnimatePresence mode="wait">
                            {!isSubmitted ? (
                                <motion.div
                                    key="form"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                >
                                    <div className="flex items-center justify-between mb-8">
                                        <div>
                                            <h2 className="text-2xl font-bold">Start Your Project</h2>
                                            <p className="text-xs text-white/40 uppercase tracking-widest mt-1">Step {step} of 2</p>
                                        </div>
                                        <ShieldCheck className="w-8 h-8 text-primary/40" />
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        {step === 1 ? (
                                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Full Name</label>
                                                    <input
                                                        required
                                                        type="text"
                                                        value={formData.fullName}
                                                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                                        placeholder="John Doe"
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 focus:outline-none focus:border-primary/50 transition-colors"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Email Address</label>
                                                    <input
                                                        required
                                                        type="email"
                                                        value={formData.email}
                                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                        placeholder="john@example.com"
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 focus:outline-none focus:border-primary/50 transition-colors"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Service Type</label>
                                                    <select
                                                        value={formData.serviceType}
                                                        onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 focus:outline-none focus:border-primary/50 transition-colors appearance-none"
                                                    >
                                                        <option className="bg-[#1a1a2e]">AI Video Production</option>
                                                        <option className="bg-[#1a1a2e]">AI Scripting</option>
                                                        <option className="bg-[#1a1a2e]">Character Creation</option>
                                                    </select>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (formData.fullName.trim() && formData.email.trim()) {
                                                            setStep(2)
                                                        }
                                                    }}
                                                    className="w-full btn-primary py-4 flex items-center justify-center gap-2 group"
                                                >
                                                    Next Step <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Project Description</label>
                                                    <textarea
                                                        required
                                                        rows={4}
                                                        value={formData.projectDescription}
                                                        onChange={(e) => setFormData({ ...formData, projectDescription: e.target.value })}
                                                        placeholder="Tell us about your creative vision..."
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                                                            <DollarSign className="w-3 h-3" /> Budget Range
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={formData.budgetRange}
                                                            onChange={(e) => setFormData({ ...formData, budgetRange: e.target.value })}
                                                            placeholder="$1k - $5k"
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 focus:outline-none focus:border-primary/50 transition-colors"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                                                            <Clock className="w-3 h-3" /> Timeline
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={formData.timeline}
                                                            onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
                                                            placeholder="2-4 Weeks"
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 focus:outline-none focus:border-primary/50 transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex gap-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => setStep(1)}
                                                        className="px-6 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-colors"
                                                    >
                                                        Back
                                                    </button>
                                                    <button
                                                        type="submit"
                                                        disabled={isSubmitting}
                                                        className="flex-grow btn-primary py-4 flex items-center justify-center gap-2 disabled:opacity-60"
                                                    >
                                                        {isSubmitting ? "Saving Request..." : "Send Request"} <Send className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                {submitMessage && (
                                                    <p className="text-xs text-white/40 text-center">{submitMessage}</p>
                                                )}
                                            </div>
                                        )}
                                    </form>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center py-12 space-y-6"
                                >
                                    <div className="inline-flex p-6 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-500 mb-4">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                    <h2 className="text-3xl font-bold">Request Received!</h2>
                                    <p className="text-white/60 max-w-sm mx-auto leading-relaxed">
                                        Thank you for your inquiry. Our creative director will review your project and get back to you within 24 hours.
                                    </p>
                                    <div className="pt-8 border-t border-white/5">
                                        <button
                                            onClick={() => setIsSubmitted(false)}
                                            className="text-sm font-bold text-primary hover:underline flex items-center gap-2 mx-auto"
                                        >
                                            <MessageSquare className="w-4 h-4" /> Send another request
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </section>
        </main>
    )
}
