// Lightweight analytics event helper. Fires the same conversion to both the
// Meta Pixel (fbq) and Google Analytics 4 (gtag). Safe to call anywhere on the
// client — no-ops if a tag hasn't loaded.

/**
 * The events Meta defines itself. Everything else is ours, and has to be sent
 * through `trackCustom` instead.
 *
 * The distinction is not cosmetic. `fbq("track", "CourseStart")` looks like it
 * works — the request goes out, nothing errors — but Meta treats a made-up name
 * on the standard channel as unofficial, and an unofficial event is not
 * dependable for building custom conversions or for optimising delivery against.
 * That is the whole reason these events exist, so getting the channel wrong
 * costs everything and reports nothing.
 */
const META_STANDARD_EVENTS = new Set([
    "AddPaymentInfo",
    "AddToCart",
    "AddToWishlist",
    "CompleteRegistration",
    "Contact",
    "CustomizeProduct",
    "Donate",
    "FindLocation",
    "InitiateCheckout",
    "Lead",
    // PageView is a standard event too, and the one case where sending it as a
    // custom event would visibly break things: it is what the pixel counts as a
    // page view. layout.tsx fires it directly rather than through here, but a
    // caller that reaches for it must not be quietly downgraded.
    "PageView",
    "Purchase",
    "Schedule",
    "Search",
    "StartTrial",
    "SubmitApplication",
    "Subscribe",
    "ViewContent",
])

// Map Meta-style event names to GA4 recommended event names where they differ.
// GA4 draws no standard/custom distinction, so this mapping is unaffected by the
// split above and applies to every event alike.
const GA4_NAME: Record<string, string> = {
    Purchase: "purchase",
    Subscribe: "purchase",
    InitiateCheckout: "begin_checkout",
    CompleteRegistration: "sign_up",
    PageView: "page_view",
    Lead: "generate_lead",
    // Activation funnel. GA4 has no recommended name for any of these, so they
    // get snake_case names in its own house style rather than a forced fit.
    CourseStart: "course_start",
    DirectorOpened: "director_opened",
    // Sent server-side through the Conversions API, so these two never reach
    // fbTrack. Kept so the naming stays in one place if that ever changes.
    FirstGeneration: "first_generation",
    SecondGeneration: "second_generation",
}

export function fbTrack(event: string, params?: Record<string, unknown>) {
    if (typeof window === "undefined") return

    const fbq = (window as any).fbq
    if (typeof fbq === "function") {
        fbq(META_STANDARD_EVENTS.has(event) ? "track" : "trackCustom", event, params)
    }

    const gtag = (window as any).gtag
    if (typeof gtag === "function") gtag("event", GA4_NAME[event] || event, params)
}
