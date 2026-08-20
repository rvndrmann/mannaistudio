import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { MEDIA_BUCKET, QUICK_GENERATIONS_TABLE, requireAuthenticatedUser, toHistoryItem } from "@/lib/studio/quick-generation"

/**
 * Everything generated outside a production, newest first.
 *
 * A table of its own, so there is no filter to get right: every row here is a
 * standalone generation. RLS restricts it to the caller, and the user_id filter
 * is kept anyway so the query uses the index rather than relying on the policy
 * to narrow it.
 */

const querySchema = z.object({
  type: z.enum(["image", "video", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  // Keyset rather than an offset: a page loaded while a generation finishes
  // would otherwise repeat or skip a row as everything shifts down by one.
  before: z.string().datetime().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuthenticatedUser()
    const params = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))

    let query = context.supabase
      .from(QUICK_GENERATIONS_TABLE)
      .select("id,type,status,prompt,model,provider,result_path,error,credits_used,credits_refunded,billing_mode,settings,created_at,completed_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(params.limit)
    if (params.type !== "all") query = query.eq("type", params.type)
    if (params.before) query = query.lt("created_at", params.before)

    const { data, error } = await query
    if (error) throw error
    const items = (data || []).map(toHistoryItem)

    return NextResponse.json({
      items,
      // Absent when the page came back short, which is how the client knows to
      // stop asking rather than requesting an empty page to find out.
      nextCursor: items.length === params.limit ? items[items.length - 1].createdAt : null,
    })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not load your generation history") }, { status: studioErrorStatus(error) })
  }
}

/**
 * Removes one generation, file included.
 *
 * Dropping the row alone would orphan the file in storage — invisible, still
 * counted against the bucket, and unreachable for ever. The file goes first: if
 * that fails the row stays and the delete can be retried, which is recoverable,
 * whereas the other order is not.
 */
export async function DELETE(request: NextRequest) {
  try {
    const context = await requireAuthenticatedUser()
    const id = request.nextUrl.searchParams.get("id") || ""
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Valid id is required" }, { status: 400 })

    const { data: job } = await context.supabase
      .from(QUICK_GENERATIONS_TABLE)
      .select("id,result_path")
      .eq("id", id)
      .eq("user_id", context.user.id)
      .maybeSingle()
    if (!job) return NextResponse.json({ error: "Generation not found" }, { status: 404 })

    if (job.result_path) {
      const { error: removeError } = await context.supabase.storage.from(MEDIA_BUCKET).remove([job.result_path])
      if (removeError) throw removeError
    }
    const { error } = await context.supabase.from(QUICK_GENERATIONS_TABLE).delete().eq("id", job.id)
    if (error) throw error

    return NextResponse.json({ deleted: true, id: job.id })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete this generation") }, { status: studioErrorStatus(error) })
  }
}
