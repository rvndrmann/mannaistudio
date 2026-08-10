import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"

// A positive amount allocates team pool -> member; a negative amount reclaims.
// Omitting profileId moves credits between the caller's personal balance and the
// team pool instead (positive transfers in, negative transfers out).
const allocateSchema = z.object({
  profileId: z.string().uuid().optional(),
  amount: z.number().int().refine((value) => value !== 0, "Enter a credit amount"),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const input = allocateSchema.parse(await request.json())
    const { data, error: allocateError } = input.profileId
      ? await supabase.rpc("allocate_team_credits", { p_profile_id: input.profileId, p_amount: input.amount })
      : await supabase.rpc("transfer_team_credits", { p_amount: input.amount })
    if (allocateError) return NextResponse.json({ error: allocateError.message }, { status: 400 })

    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({
      teamBalance: row?.team_balance ?? null,
      memberBalance: row?.member_balance ?? null,
      personalBalance: row?.personal_balance ?? null,
    })
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "Enter a valid credit amount" }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not move credits" }, { status: 500 })
  }
}
