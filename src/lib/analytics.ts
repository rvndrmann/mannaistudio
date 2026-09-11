/**
 * First-party viewer analytics — the browser half.
 *
 * Everything here is fire-and-forget and none of it may ever throw into the
 * page. A player that stops playing because a stats beacon failed is a far
 * worse outcome than a missing row, so every function swallows its errors and
 * every storage read is guarded: private windows, blocked site data and
 * embedded webviews all make `localStorage` itself throw on access.
 *
 * Two identities, doing different jobs:
 *
 *   visitorId  localStorage, survives the tab — this is what "1,400 people
 *              visited" counts
 *   sessionId  sessionStorage, dies with the tab — this is what "one visit"
 *              means, and what a second visit is measured against
 *
 * Neither is a tracking identifier for anyone else's benefit: they never leave
 * this origin, and the server attaches the account id itself from the session
 * cookie rather than trusting anything sent from here.
 */

const VISITOR_KEY = "ms_visitor_id"
const SESSION_KEY = "ms_session_id"
const ENDPOINT = "/api/analytics/track"

/** How often a visible tab says it is still there. Half the server's live window. */
export const HEARTBEAT_MS = 30_000

/** How often a playing episode reports progress. */
export const WATCH_REPORT_MS = 15_000

function randomId(): string {
    try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID()
        }
    } catch { /* falls through */ }
    // Chrome only exposes randomUUID in a secure context, so a plain-http dev
    // host on the LAN — which `next dev --hostname 0.0.0.0` invites — lands
    // here. The server takes any uuid, it just has to be well-formed.
    const bytes = new Uint8Array(16)
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes)
    else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Reads an id from storage, minting and saving one when there is none.
 *
 * When storage is unavailable the id is minted anyway and simply not persisted:
 * that visitor is counted as new on every page, which overstates visitors a
 * little. The alternative — dropping them — understates the whole funnel, and
 * the people most likely to be in a private window are the ones sampling the
 * free episodes.
 */
function readId(storage: "local" | "session", key: string): string {
    if (typeof window === "undefined") return ""
    try {
        const store = storage === "local" ? window.localStorage : window.sessionStorage
        const existing = store.getItem(key)
        if (existing) return existing
        const fresh = randomId()
        store.setItem(key, fresh)
        return fresh
    } catch {
        return randomId()
    }
}

export function getVisitorId(): string {
    return readId("local", VISITOR_KEY)
}

export function getSessionId(): string {
    return readId("session", SESSION_KEY)
}

/** Coarse enough to be useful on a chart, coarse enough not to fingerprint. */
function getDevice(): string {
    if (typeof window === "undefined") return "unknown"
    const width = window.innerWidth || 0
    if (width > 0 && width < 768) return "mobile"
    if (width >= 768 && width < 1180) return "tablet"
    return "desktop"
}

type TrackBody = Record<string, unknown>

/**
 * Posts one event.
 *
 * `keepalive` is what makes a report survive the navigation that triggered it —
 * without it the browser cancels in-flight fetches on unload, which is exactly
 * when the final watch position is sent. `sendBeacon` is used when the page is
 * actually going away, because it is the only transport the browser guarantees
 * to drain.
 */
function post(body: TrackBody, useBeacon = false): void {
    if (typeof window === "undefined") return
    const payload = JSON.stringify(body)
    try {
        if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
            const blob = new Blob([payload], { type: "application/json" })
            if (navigator.sendBeacon(ENDPOINT, blob)) return
        }
        void fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
        }).catch(() => { /* analytics must never surface an error to the page */ })
    } catch { /* as above */ }
}

export function reportPageView(path: string): void {
    post({
        type: "pageview",
        visitorId: getVisitorId(),
        sessionId: getSessionId(),
        path,
        referrer: typeof document !== "undefined" ? document.referrer : "",
        device: getDevice(),
    })
}

export function reportHeartbeat(): void {
    post({
        type: "heartbeat",
        visitorId: getVisitorId(),
        sessionId: getSessionId(),
        device: getDevice(),
    })
}

export type WatchReport = {
    episodeId: string
    /** Seconds actually sat through, accumulated across pauses — not the clock position. */
    secondsWatched: number
    /** Deepest point reached, which is what a drop-off curve is drawn from. */
    furthestSecond: number
    durationSeconds: number
    completed: boolean
    /** free | unlocked | pass | purchased — how it was being watched at the time. */
    access: string
}

export function reportWatch(report: WatchReport, useBeacon = false): void {
    if (!report.episodeId) return
    post({
        type: "watch",
        visitorId: getVisitorId(),
        sessionId: getSessionId(),
        device: getDevice(),
        episodeId: report.episodeId,
        secondsWatched: Math.max(0, Math.round(report.secondsWatched)),
        furthestSecond: Math.max(0, Math.round(report.furthestSecond)),
        durationSeconds: Math.max(0, Math.round(report.durationSeconds)),
        completed: report.completed,
        access: report.access,
    }, useBeacon)
}
