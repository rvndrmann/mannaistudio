import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  slug: z.string().min(1),
  episodeNumber: z.number().int().positive(),
  email: z.string().email().optional(),
  phone: z.string().trim().min(6).max(20).optional(),
})

/**
 * Join the waiting list for an episode that has not been published yet.
 *
 * Signed out is allowed on purpose: the viewer who just finished the last free
 * episode is the one most worth keeping, and making them create an account
 * before they may be told about episode four loses them at the exact moment
 * they were interested. A signed-in viewer's address is taken from their
 * profile so they do not have to type one.
 *
 * Everything that decides whether the ask is legitimate — that the series is
 * published, that the number is inside the announced season, that the episode
 * is not already out — happens inside `request_originals_notify`.
 */
export async function POST(request: NextRequest) {
  try {
    const { slug, episodeNumber, email, phone } = bodySchema.parse(await request.json())
    const admin = createServiceClient()

    const { data: series } = await admin
      .from("originals_series")
      .select("id")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle()

    if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let contactEmail = email?.trim() || null
    if (!contactEmail && user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle()
      contactEmail = profile?.email ?? user.email ?? null
    }

    if (!contactEmail && !phone) {
      return NextResponse.json(
        { error: "Leave an email address or a phone number so we can reach you." },
        { status: 400 },
      )
    }

    // Called as the viewer, not as the service role: the function reads
    // auth.uid() to attach the request to an account when there is one.
    const { error } = await supabase.rpc("request_originals_notify", {
      p_series_id: series.id,
      p_episode_number: episodeNumber,
      p_email: contactEmail,
      p_phone: phone ?? null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, email: contactEmail })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "That request was not something we could read." }, { status: 400 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save that request" },
      { status: 500 },
    )
  }
}
