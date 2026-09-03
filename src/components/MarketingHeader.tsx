"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { defaultSiteFeatures, fetchSiteFeatures, type SiteFeatures } from "@/lib/studio/feature-flags"

export function MarketingHeader() {
    const pathname = usePathname()
    // null until known, so paused tabs are never shown and then withdrawn.
    const [features, setFeatures] = useState<SiteFeatures | null>(null)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()
            try {
                setFeatures(await fetchSiteFeatures(supabase))
            } catch {
                setFeatures(defaultSiteFeatures)
            }
        }
        load()
    }, [])

    const items = [
        { name: "Calendar", href: "/calendar", key: "calendar" },
        { name: "Analytics", href: "/analytics", key: "analytics" },
        { name: "Ads Manager", href: "/ads", key: "ads" },
        { name: "Competitors", href: "/competitors", key: "competitors" },
    ].filter(item => features !== null && (features as any)[item.key] !== false)

    if (items.length === 0) return null

    return (
        <div className="flex items-center justify-center gap-8 py-3 mb-8 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md rounded-2xl max-w-4xl mx-auto px-6">
            {items.map((item) => {
                const active = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`text-sm font-medium transition ${
                            active
                                ? "text-primary font-bold border-b-2 border-primary pb-1"
                                : "text-white/60 hover:text-white"
                        }`}
                    >
                        {item.name}
                    </Link>
                )
            })}
        </div>
    )
}
