"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { HEARTBEAT_MS, reportHeartbeat, reportPageView } from "@/lib/analytics"

/**
 * Reports page views and presence for every visitor, signed in or not.
 *
 * Mounted once in the root layout. Two jobs:
 *
 *   - one page view per path, including client-side navigations, which is what
 *     "how many people visited" is counted from
 *   - a heartbeat every 30 seconds while the tab is actually visible, which is
 *     what "who is here right now" is read from
 *
 * The visibility check is the whole reason the live number means anything. A
 * naked interval keeps beating in a tab someone abandoned three days ago on a
 * desktop that never slept, and the site would claim an audience made of
 * forgotten tabs. Hidden tabs stop beating and drop out of the live window on
 * their own; coming back to the tab beats immediately rather than waiting out
 * the interval, so returning to it shows up at once.
 */
export default function AnalyticsTracker() {
    const pathname = usePathname()
    const lastPath = useRef<string | null>(null)

    useEffect(() => {
        if (!pathname || pathname === lastPath.current) return
        lastPath.current = pathname
        reportPageView(pathname)
    }, [pathname])

    useEffect(() => {
        const beat = () => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return
            reportHeartbeat()
        }

        const timer = setInterval(beat, HEARTBEAT_MS)
        document.addEventListener("visibilitychange", beat)
        return () => {
            clearInterval(timer)
            document.removeEventListener("visibilitychange", beat)
        }
    }, [])

    return null
}
