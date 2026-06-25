// Lightweight Meta Pixel event helper. Safe to call anywhere on the client —
// no-ops if the pixel (fbq) hasn't loaded.
export function fbTrack(event: string, params?: Record<string, unknown>) {
    if (typeof window === "undefined") return
    const fbq = (window as any).fbq
    if (typeof fbq !== "function") return
    fbq("track", event, params)
}
