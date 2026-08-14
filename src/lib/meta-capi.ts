// Server-side Meta Conversions API.
//
// The browser pixel in layout.tsx is fine for PageView, but it is the wrong
// place for a purchase: ad blockers, Safari ITP, and users closing the tab on
// the redirect back from Razorpay all drop the event. Purchases are the one
// conversion we cannot afford to lose — Meta's ad delivery optimises against
// them — so they are sent from the server, where the Razorpay webhook has
// already confirmed the money moved.
//
// Set META_CAPI_ACCESS_TOKEN in the environment (Events Manager -> Settings ->
// Conversions API -> Generate access token). Without it, every call no-ops
// quietly so local and preview environments do not send junk to the pixel.

import crypto from "crypto"

const PIXEL_ID = "998332272805619"
const API_VERSION = "v21.0"

/** SHA-256 as Meta wants it: trimmed, lowercased, hex. Undefined for empty input. */
function hashed(value: string | undefined | null): string | undefined {
    const normalized = value?.trim().toLowerCase()
    if (!normalized) return undefined
    return crypto.createHash("sha256").update(normalized).digest("hex")
}

export type CapiEvent = {
    /** Meta event name, e.g. "Purchase". */
    eventName: string
    /**
     * Stable ID for this event. Meta deduplicates on it, so pass something
     * derived from the thing that happened (a payment ID), never a random
     * value — Razorpay retries webhooks, and a retry must not double-count.
     * It is also what pairs a server event with a browser event of the same name.
     */
    eventId: string
    /** Raw email. Hashed here — never pass an already-hashed value. */
    email?: string
    /** Raw user/profile ID. Hashed here. Improves match quality a lot. */
    externalId?: string
    value?: number
    currency?: string
    /** Page the conversion belongs to, for reporting. */
    sourceUrl?: string
    /** Extra custom_data fields (e.g. content_name). */
    customData?: Record<string, unknown>
}

/**
 * Sends one event to the Conversions API.
 *
 * Never throws and never rejects — a webhook must still return 200 to Razorpay
 * even if Meta is down, otherwise Razorpay retries a payment we already
 * credited. Failures are logged and swallowed.
 */
export async function sendCapiEvent(event: CapiEvent): Promise<void> {
    const accessToken = process.env.META_CAPI_ACCESS_TOKEN
    if (!accessToken) return

    try {
        const userData: Record<string, unknown> = {}
        const em = hashed(event.email)
        const externalId = hashed(event.externalId)
        if (em) userData.em = [em]
        if (externalId) userData.external_id = [externalId]

        // With no identifiers Meta cannot attribute the conversion to anyone,
        // and the event is just noise in the dataset.
        if (!em && !externalId) return

        const customData: Record<string, unknown> = { ...event.customData }
        if (typeof event.value === "number" && Number.isFinite(event.value)) {
            customData.value = event.value
            customData.currency = event.currency || "INR"
        }

        const payload = {
            data: [
                {
                    event_name: event.eventName,
                    event_time: Math.floor(Date.now() / 1000),
                    event_id: event.eventId,
                    action_source: "website",
                    event_source_url: event.sourceUrl || "https://www.aidirectorhub.com/billing",
                    user_data: userData,
                    custom_data: customData,
                },
            ],
            // Set META_CAPI_TEST_EVENT_CODE while verifying in Events Manager ->
            // Test Events, then remove it. Events sent with it do not count
            // toward optimisation.
            ...(process.env.META_CAPI_TEST_EVENT_CODE
                ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE }
                : {}),
        }

        const res = await fetch(
            `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${accessToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            },
        )

        if (!res.ok) {
            console.error("[meta-capi] rejected", event.eventName, res.status, await res.text())
        }
    } catch (error) {
        console.error("[meta-capi] failed", event.eventName, error)
    }
}
