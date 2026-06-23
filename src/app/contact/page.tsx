"use client"

import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { Mail, Phone, MapPin, MessageSquare, Clock } from "lucide-react"
import { useState } from "react"

export default function ContactPage() {
    const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" })
    const [sent, setSent] = useState(false)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const mailtoLink = `mailto:rvndr.mann@gmail.com?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`)}`
        window.open(mailtoLink)
        setSent(true)
    }

    return (
        <main className="min-h-screen">
            <Navbar />
            <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
                <h1 className="text-4xl font-bold tracking-tight mb-3">Contact Us</h1>
                <p className="text-white/50 mb-10">Have a question, feedback, or need help? Reach out and we'll get back to you.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                    {[
                        { icon: Mail, title: "Email", text: "rvndr.mann@gmail.com" },
                        { icon: Phone, title: "Phone", text: "+91 8168157635" },
                        { icon: MessageSquare, title: "Support", text: "Via email or in-app chat" },
                        { icon: Clock, title: "Response Time", text: "Within 24–48 hours" },
                    ].map((item) => (
                        <div key={item.title} className="glass-card p-5 rounded-2xl border-white/10 text-center">
                            <item.icon className="w-5 h-5 text-primary mx-auto mb-3" />
                            <h2 className="font-bold text-sm">{item.title}</h2>
                            <p className="text-xs text-white/40 mt-1">{item.text}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
                    <div>
                        {sent ? (
                            <div className="glass-card p-8 rounded-2xl border-white/10 text-center">
                                <p className="text-lg font-bold text-emerald-300 mb-2">Message ready to send!</p>
                                <p className="text-sm text-white/50">Your email client should have opened with the message. If not, email us directly at rvndr.mann@gmail.com.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="glass-card p-6 rounded-2xl border-white/10 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Name</label>
                                        <input
                                            required
                                            value={form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Email</label>
                                        <input
                                            required
                                            type="email"
                                            value={form.email}
                                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Subject</label>
                                    <input
                                        required
                                        value={form.subject}
                                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Message</label>
                                    <textarea
                                        required
                                        rows={5}
                                        value={form.message}
                                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none"
                                    />
                                </div>
                                <button type="submit" className="btn-primary px-8 py-3">Send Message</button>
                            </form>
                        )}
                    </div>

                    <div className="glass-card p-6 rounded-2xl border-white/10 h-fit">
                        <h3 className="font-bold mb-4">Registered Business</h3>
                        <div className="space-y-3 text-sm text-white/50">
                            <p className="font-bold text-white/70">AIDIRECTORHUB</p>
                            <p>Proprietor: Ravinder Deep Singh</p>
                            <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/30" />
                                <p className="leading-relaxed text-xs">
                                    597, VPO Barwala, Panchkula, Haryana – 134118, India
                                </p>
                            </div>
                            <p className="text-xs text-white/30">Udyam Reg: UDYAM-HR-13-0038483</p>
                            <div className="flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5 text-white/30" />
                                <a href="mailto:rvndr.mann@gmail.com" className="text-xs hover:text-white transition-colors">rvndr.mann@gmail.com</a>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone className="w-3.5 h-3.5 text-white/30" />
                                <a href="tel:+918168157635" className="text-xs hover:text-white transition-colors">+91 8168157635</a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Grievance Redressal — required for payment gateway / RBI compliance */}
                <div id="grievance" className="glass-card p-6 md:p-8 rounded-2xl border-white/10 mt-8">
                    <h2 className="text-xl font-bold mb-2">Grievance Redressal</h2>
                    <p className="text-sm text-white/50 mb-5 max-w-2xl">
                        In accordance with the Consumer Protection (E-Commerce) Rules, 2020 and applicable RBI guidelines,
                        the details of our Grievance Officer are provided below. Any complaint regarding payments, refunds,
                        services, or content can be addressed to the Grievance Officer, who will acknowledge your complaint
                        within 48 hours and resolve it within 30 days of receipt.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-white/40">Name:</span>
                            <span className="font-bold text-white/80">Ravinder Deep Singh</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-white/40">Designation:</span>
                            <span className="font-bold text-white/80">Grievance Officer / Proprietor</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-white/30" />
                            <a href="mailto:rvndr.mann@gmail.com" className="hover:text-white transition-colors">rvndr.mann@gmail.com</a>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-white/30" />
                            <a href="tel:+918168157635" className="hover:text-white transition-colors">+91 8168157635</a>
                        </div>
                        <div className="flex items-start gap-2 sm:col-span-2">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/30" />
                            <span className="text-white/60 text-xs leading-relaxed">
                                597, VPO Barwala, Panchkula, Haryana – 134118, India
                            </span>
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                            <Clock className="w-3.5 h-3.5 text-white/30" />
                            <span className="text-white/60 text-xs">Business hours: Monday – Saturday, 10:00 AM – 6:00 PM IST</span>
                        </div>
                    </div>
                </div>
            </section>
            <Footer />
        </main>
    )
}
