// Lightweight analytics event helper. Fires the same conversion to both the
// Meta Pixel (fbq) and Google Analytics 4 (gtag). Safe to call anywhere on the
// client — no-ops if a tag hasn't loaded.

// Map Meta-style event names to GA4 recommended event names where they differ.
const GA4_NAME: Record<string, string> = {
    Purchase: "purchase",
    Subscribe: "purchase",
    InitiateCheckout: "begin_checkout",
    CompleteRegistration: "sign_up",
    PageView: "page_view",
    Lead: "generate_lead",
}

export function fbTrack(event: string, params?: Record<string, unknown>) {
    if (typeof window === "undefined") return

    const fbq = (window as any).fbq
    if (typeof fbq === "function") fbq("track", event, params)

    const gtag = (window as any).gtag
    if (typeof gtag === "function") gtag("event", GA4_NAME[event] || event, params)
}
