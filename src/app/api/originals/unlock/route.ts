import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

/**
 * Open an episode, charging for it if this is the first time.
 *
 * The request names an episode and nothing else — no price, no series, no
 * amount. Everything that decides value is read inside
 * `unlock_originals_episode`, which takes the price from the series row and
 * writes the debit, the unlock, and the ledger entry in one transaction. A
 * caller cannot ask to be charged less, and a double-click cannot be charged
 * twice: the unique index on (profile_id, episode_id) makes the second call an
 * `owned` result.
 *
 * This is also the only route that returns `video_url`, and it returns it only
 * after that transaction has settled.
 */

const unlockSchema = z.object({
  episodeId: z.string().uuid(),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = await request.json().catch(() => null)
    if (body === null) {
      return NextResponse.json({ error: "An episode is required." }, { status: 400 })
    }
    const input = unlockSchema.parse(body)

    // No account: the opening episodes still play. `originals_free_episode_url`
    // returns a URL only for an episode inside a published series' free window,
    // so naming a paid episode here yields nothing rather than a way around the
    // paywall. Nothing is charged and no entitlement is written.
    if (!user) {
      const anon = createServiceClient()
      const { data: freeUrl, error: freeError } = await anon.rpc("originals_free_episode_url", {
        p_episode_id: input.episodeId,
      })
      if (freeError) {
        return NextResponse.json({ error: freeError.message }, { status: 400 })
      }
      if (!freeUrl) {
        return NextResponse.json(
          { error: "Sign in to unlock this episode.", status: "signin" },
          { status: 401 },
        )
      }
      return NextResponse.json({ status: "free", videoUrl: freeUrl, creditsCharged: 0, balance: null })
    }

    // Service role: the function is SECURITY DEFINER and accepts the account as
    // a parameter, so it is called with the id proven by the session above
    // rather than one taken from the request.
    const admin = createServiceClient()
    const { data, error } = await admin.rpc("unlock_originals_episode", {
      p_profile_id: user.id,
      p_episode_id: input.episodeId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const result = Array.isArray(data) ? data[0] : data
    if (!result) {
      return NextResponse.json({ error: "That episode is not available." }, { status: 404 })
    }

    if (result.status === "insufficient") {
      return NextResponse.json(
        {
          error: `This episode costs ${result.credits_charged} credits and you have ${result.new_balance}.`,
          status: "insufficient",
          required: result.credits_charged,
          balance: result.new_balance,
        },
        { status: 402 },
      )
    }

    if (!result.video_url) {
      return NextResponse.json({ error: "This episode has no video yet." }, { status: 409 })
    }

    return NextResponse.json({
      status: result.status,
      videoUrl: result.video_url,
      creditsCharged: result.credits_charged,
      balance: result.new_balance,
    })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid episode reference." }, { status: 400 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open this episode" },
      { status: 500 },
    )
  }
}
