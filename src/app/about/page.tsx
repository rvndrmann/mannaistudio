import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { Zap, Video, BookOpen, Briefcase, MapPin, Mail } from "lucide-react"

export const metadata = {
    title: "About Us | AI Director Hub",
    description: "AI Director Hub teaches AI video creation and filmmaking through project-based courses, and offers professional AI video services. Learn who we are and what we build.",
}

export default function AboutPage() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <section className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
                <h1 className="text-4xl font-bold tracking-tight mb-3">About Us</h1>
                <p className="text-white/50 mb-12 max-w-2xl">
                    AI Director Hub is an online platform for learning AI video creation and accessing professional AI services.
                </p>

                <div className="space-y-10">
                    <div className="glass-card p-8 rounded-2xl border-white/10">
                        <h2 className="text-2xl font-bold mb-4">What We Do</h2>
                        <p className="text-white/60 leading-relaxed mb-6">
                            AI Director Hub sells AI courses and digital products for aspiring AI video creators, and offers professional AI services including AI video creation, scriptwriting, and post-production. Our platform helps creators learn cutting-edge AI tools and build their portfolios.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {[
                                { icon: BookOpen, title: "AI Courses", text: "Step-by-step courses on AI video creation tools like Seedance, Kling, and more." },
                                { icon: Video, title: "AI Services", text: "Professional AI video creation services — custom-quoted per project." },
                                { icon: Briefcase, title: "AI Jobs", text: "A marketplace connecting AI creators with clients who need video production." },
                            ].map((item) => (
                                <div key={item.title} className="p-5 bg-white/5 rounded-xl border border-white/10">
                                    <item.icon className="w-5 h-5 text-primary mb-3" />
                                    <h3 className="font-bold text-sm mb-1">{item.title}</h3>
                                    <p className="text-xs text-white/40">{item.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-card p-8 rounded-2xl border-white/10">
                        <h2 className="text-2xl font-bold mb-4">Our Products</h2>
                        <ul className="space-y-3 text-white/60 text-sm">
                            <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" /> <strong className="text-white">AI Courses & Digital Products</strong> — Fixed-price courses delivered digitally via in-app access. Prices are displayed on each course page.</li>
                            <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" /> <strong className="text-white">AI Director Hub Pro Membership</strong> — Monthly membership for premium course access and extended portfolio features.</li>
                            <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" /> <strong className="text-white">AI Services</strong> — Custom AI video creation services priced on a per-project/quote basis. Contact us for pricing.</li>
                        </ul>
                    </div>

                    <div className="glass-card p-8 rounded-2xl border-white/10">
                        <h2 className="text-2xl font-bold mb-4">Registered Business Details</h2>
                        <div className="space-y-3 text-sm text-white/60">
                            <p><strong className="text-white">Legal Name:</strong> AIDIRECTORHUB</p>
                            <p><strong className="text-white">Proprietor:</strong> Ravinder Deep Singh</p>
                            <div className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
                                <p>
                                    VPO Barwala, Panchkula, Haryana – 134118, India
                                </p>
                            </div>
                            <p><strong className="text-white">Udyam Registration No.:</strong> UDYAM-HR-13-0038483</p>
                            <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-white/30" />
                                <a href="mailto:rvndr.mann@gmail.com" className="text-primary hover:underline">rvndr.mann@gmail.com</a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <Footer />
        </main>
    )
}
