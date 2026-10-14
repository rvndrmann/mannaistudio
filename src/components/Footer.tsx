import Link from "next/link"
import { Mail } from "lucide-react"

const legalLinks = [
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/refund", label: "Refund & Cancellation Policy" },
    { href: "/contact", label: "Contact Us" },
    { href: "/contact#grievance", label: "Grievance Redressal" },
]

// The footer is rendered for everyone, so it can only carry links everyone can
// follow. It speaks for the done-for-you offer — the business the site now
// sells — so it leads with the agency pages rather than the Academy, which a
// visitor who came to hire a team has no use for.
const siteLinks = [
    { href: "/hire-us", label: "Our Services" },
    { href: "/hire-us/brief", label: "Start a Brief" },
    { href: "/hire-us/projects", label: "My Projects" },
    { href: "/about", label: "About Us" },
]

/** `flush` drops the top margin, for a page whose last section already ends on a rule. */
export default function Footer({ flush = false }: { flush?: boolean }) {
    return (
        <footer className={`border-t border-white/[.08] ${flush ? "" : "mt-20"}`}>
            <div className="max-w-6xl mx-auto border-x border-white/[.08] px-5 sm:px-8 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
                <div className="sm:col-span-2 lg:col-span-1">
                    <Link href="/" className="flex min-h-[44px] items-center gap-2.5 font-medium tracking-[-0.03em] text-base mb-2">
                        <img src="/logo.png" alt="AI Director Hub" className="w-7 h-7 rounded-full" />
                        <span>AI Director Hub</span>
                    </Link>
                    <p className="max-w-[16rem] text-sm leading-relaxed text-white/45">Done-for-you AI video ads for brands — UGC, product, direct-response and cinematic creatives, made by our team.</p>
                </div>

                <div>
                    <h3 className="text-[13px] font-normal text-white/85 mb-4">Agency</h3>
                    <ul className="sm:space-y-2">
                        {siteLinks.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href} className="flex min-h-[44px] items-center text-sm text-white/45 hover:text-white transition-colors sm:min-h-0 sm:py-1">
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                <div>
                    <h3 className="text-[13px] font-normal text-white/85 mb-4">Legal</h3>
                    <ul className="sm:space-y-2">
                        {legalLinks.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href} className="flex min-h-[44px] items-center text-sm text-white/45 hover:text-white transition-colors sm:min-h-0 sm:py-1">
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                <div>
                    <h3 className="text-[13px] font-normal text-white/85 mb-4">Business Info</h3>
                    <div className="space-y-3 text-sm text-white/40">
                        <p className="text-white/60">AIDIRECTORHUB</p>
                        <p>Proprietor: Ravinder Deep Singh</p>
                        <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-white/30" />
                            <a href="mailto:rvndr.mann@gmail.com" className="flex min-h-[44px] items-center hover:text-white transition-colors">rvndr.mann@gmail.com</a>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto border-x border-t border-white/[.08] px-5 sm:px-8 py-6 text-xs text-white/35">
                © {new Date().getFullYear()} AIDIRECTORHUB. All rights reserved. | Proprietor: Ravinder Deep Singh
            </div>
        </footer>
    )
}
