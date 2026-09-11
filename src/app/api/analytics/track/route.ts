import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

/**
 * The one place viewer analytics are written.
 *
 * Deliberately public: the opening episodes play without an account, so a route
 * that required a session would be blind to the half of the funnel where people
 * decide whether to stay. What it will not do is take the account id from the
 * request — `profile_id` is read from the session cookie here and passed to the
 * recording functions, which are service-role only. A client can inflate its
 * own numbers; it cannot attribute a watch to somebody else.
 *
 * It never fails loudly. A 500 from a stats beacon would show up in the
 * browser console of every visitor and change nothing about the page, so every
 * outcome that isn't a malformed body is a 204.
 */

const pageviewSchema = z.object({
  type: z.literal("pageview"),
  visitorId: z.string().uuid(),
  sessionId: z.string().uuid(),
  path: z.string().max(500),
  referrer: z.string().max(500).optional().default(""),
  device: z.string().max(20).optional().default(""),
})

const heartbeatSchema = z.object({
  type: z.literal("heartbeat"),
  visitorId: z.string().uuid(),
  sessionId: z.string().uuid(),
  device: z.string().max(20).optional().default(""),
})

const watchSchema = z.object({
  type: z.literal("watch"),
  visitorId: z.string().uuid(),
  sessionId: z.string().uuid(),
  device: z.string().max(20).optional().default(""),
  episodeId: z.string().uuid(),
  secondsWatched: z.number().int().min(0).max(86_400),
  furthestSecond: z.number().int().min(0).max(86_400),
  durationSeconds: z.number().int().min(0).max(86_400),
  completed: z.boolean(),
  access: z.enum(["free", "unlocked", "pass", "purchased"]),
})

const eventSchema = z.discriminatedUnion("type", [pageviewSchema, heartbeatSchema, watchSchema])

export async function POST(request: NextRequest) {
  let event: z.infer<typeof eventSchema>
  try {
    // sendBeacon posts a Blob, which arrives as a normal JSON body.
    event = eventSchema.parse(await request.json())
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 })
    }
    return NextResponse.json({ error: "Invalid event" }, { status: 400 })
  }

  try {
    // A heartbeat deliberately skips the auth lookup. It fires every 30 seconds
    // per open tab, and `getUser()` is a round trip to the auth server — that
    // is a lot of traffic to establish something the session row already knows.
    // The recording function keeps the profile it already has when handed null,
    // so attribution survives; only the beat itself is anonymous.
    let profileId: string | null = null
    if (event.type !== "heartbeat") {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      profileId = user?.id ?? null
    }

    const admin = createServiceClient()

    if (event.type === "watch") {
      await admin.rpc("record_episode_view", {
        p_visitor_id: event.visitorId,
        p_session_id: event.sessionId,
        p_profile_id: profileId,
        p_episode_id: event.episodeId,
        p_seconds_watched: event.secondsWatched,
        p_furthest_second: event.furthestSecond,
        p_duration_seconds: event.durationSeconds,
        p_completed: event.completed,
        p_access: event.access,
      })
      return new NextResponse(null, { status: 204 })
    }

    await admin.rpc("record_site_visit", {
      p_visitor_id: event.visitorId,
      p_session_id: event.sessionId,
      p_profile_id: profileId,
      p_path: event.type === "pageview" ? event.path : null,
      p_referrer: event.type === "pageview" ? event.referrer : null,
      // Truncated rather than parsed. The device bucket is what the charts use;
      // the raw string is only ever read by a human debugging one odd session.
      p_user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      p_device: event.device || null,
      p_is_page_view: event.type === "pageview",
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    // Swallowed on purpose. A lost row is invisible; a failed beacon is a red
    // line in the console of every page on the site.
    return new NextResponse(null, { status: 204 })
  }
}
