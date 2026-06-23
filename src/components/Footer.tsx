import Link from "next/link"
import { Zap, Mail, Phone, MapPin } from "lucide-react"

const legalLinks = [
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/refund", label: "Refund & Cancellation Policy" },
    { href: "/shipping", label: "Shipping & Delivery Policy" },
    { href: "/contact", label: "Contact Us" },
    { href: "/contact#grievance", label: "Grievance Redressal" },
]

const siteLinks = [
    { href: "/courses", label: "Courses" },
    { href: "/challenges", label: "Challenges" },
    { href: "/services", label: "AI Jobs" },
    { href: "/billing", label: "Pricing" },
    { href: "/about", label: "About Us" },
]

export default function Footer() {
    return (
        <footer className="border-t border-white/10 mt-20">
            <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
                <div className="sm:col-span-2 lg:col-span-1">
                    <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-3">
                        <Zap className="w-5 h-5 text-primary" />
                        <span>AI Director <span className="text-primary">Hub</span></span>
                    </Link>
                    <p className="text-sm text-white/40 leading-relaxed">
                        Learn AI video creation step by step — from scriptwriting to publishing. Build your portfolio and earn through AI jobs.
                    </p>
                </div>

                <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider text-white/60 mb-4">Explore</h3>
                    <ul className="space-y-2">
                        {siteLinks.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href} className="text-sm text-white/40 hover:text-white transition-colors">
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider text-white/60 mb-4">Legal</h3>
                    <ul className="space-y-2">
                        {legalLinks.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href} className="text-sm text-white/40 hover:text-white transition-colors">
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider text-white/60 mb-4">Business Info</h3>
                    <div className="space-y-3 text-sm text-white/40">
                        <p className="font-bold text-white/60">AIDIRECTORHUB</p>
                        <p>Proprietor: Ravinder Mann</p>
                        <div className="flex items-start gap-2">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-white/30" />
                            <p className="leading-relaxed">
                                Flat/Door/Block No. 597, Panchkula,
                                Block – Barwala, City – Panchkula,
                                District – Panchkula,
                                Haryana – 134118, India
                            </p>
                        </div>
                        <p className="text-xs text-white/30">Udyam Reg: UDYAM-HR-13-0038483</p>
                        <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-white/30" />
                            <a href="mailto:rvndr.mann@gmail.com" className="hover:text-white transition-colors">rvndr.mann@gmail.com</a>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-white/30" />
                            <a href="tel:+918168157635" className="hover:text-white transition-colors">+91 8168157635</a>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t border-white/5 py-6 text-center text-xs text-white/25">
                © {new Date().getFullYear()} AIDIRECTORHUB. All rights reserved. | Proprietor: Ravinder Mann
            </div>
        </footer>
    )
}
