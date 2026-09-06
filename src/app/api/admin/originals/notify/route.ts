import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const sendSchema = z.object({
  seriesId: z.string().uuid(),
  episodeNumber: z.number().int().positive(),
}).strict()

/**
 * The waiting list for a series, newest ask first, pending ones on top.
 *
 * Admin-only, and enforced inside `admin_originals_notify_list` rather than
 * here — the route is a thin caller so there is one place that decides.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const seriesId = request.nextUrl.searchParams.get("seriesId")
    const { data, error } = await supabase.rpc("admin_originals_notify_list", {
      p_series_id: seriesId || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ requests: data || [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the waiting list" },
      { status: 500 },
    )
  }
}

/**
 * Tell everyone waiting on one episode that it is up.
 *
 * Rows are marked as notified only for the addresses the mail provider actually
 * accepted. A row flagged as told when nothing was sent is a viewer who never
 * hears back and never gets another chance to be told, so a partial failure
 * leaves the rest pending for the next attempt.
 *
 * Email goes through Resend when `RESEND_API_KEY` is set. Phone numbers are
 * collected and returned here but not messaged: there is no SMS provider wired
 * up yet, so they are handed back for the admin to use rather than silently
 * dropped.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { seriesId, episodeNumber } = sendSchema.parse(await request.json())

    const { data: rows, error } = await supabase.rpc("admin_originals_notify_list", {
      p_series_id: seriesId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    type Row = {
      id: string
      series_title: string
      episode_number: number
      email: string | null
      phone: string | null
      notified_at: string | null
    }

    const pending = ((rows || []) as Row[]).filter(
      (row) => row.episode_number === episodeNumber && !row.notified_at,
    )
    if (pending.length === 0) {
      return NextResponse.json({ sent: 0, phoneOnly: [], message: "Nobody is waiting on that episode." })
    }

    const { data: series } = await supabase
      .from("originals_series")
      .select("slug, title")
      .eq("id", seriesId)
      .maybeSingle()

    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.NOTIFY_FROM_EMAIL || "AI Director Hub <onboarding@resend.dev>"
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    const watchUrl = `${siteUrl}/originals/${series?.slug ?? ""}`

    const phoneOnly = pending
      .filter((row) => !row.email && row.phone)
      .map((row) => row.phone as string)

    const mailable = pending.filter((row) => Boolean(row.email))

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Email is not configured. Set RESEND_API_KEY (and NOTIFY_FROM_EMAIL) to send from here.",
          pending: pending.length,
          phoneOnly,
        },
        { status: 503 },
      )
    }

    const delivered: string[] = []
    for (const row of mailable) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [row.email],
          subject: `Episode ${episodeNumber} of ${series?.title ?? row.series_title} is out`,
          html: `<p>You asked to hear when episode ${episodeNumber} landed.</p>
                 <p>It's up now.</p>
                 <p><a href="${watchUrl}">Watch ${series?.title ?? row.series_title}</a></p>`,
        }),
      })
      if (res.ok) delivered.push(row.id)
    }

    if (delivered.length > 0) {
      await supabase.rpc("admin_mark_originals_notified", { p_ids: delivered })
    }

    return NextResponse.json({
      sent: delivered.length,
      failed: mailable.length - delivered.length,
      phoneOnly,
    })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Name a series and an episode number." }, { status: 400 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the announcement" },
      { status: 500 },
    )
  }
}
