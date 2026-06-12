import Link from "next/link"
import { Zap } from "lucide-react"

const legalLinks = [
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/refund", label: "Refund Policy" },
    { href: "/contact", label: "Contact Us" },
]

const siteLinks = [
    { href: "/courses", label: "Courses" },
    { href: "/challenges", label: "Challenges" },
    { href: "/services", label: "AI Jobs" },
    { href: "/billing", label: "Pricing" },
]

export default function Footer() {
    return (
        <footer className="border-t border-white/10 mt-20">
            <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
                <div>
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
            </div>

            <div className="border-t border-white/5 py-6 text-center text-xs text-white/25">
                © {new Date().getFullYear()} AI Director Hub. All rights reserved.
            </div>
        </footer>
    )
}
