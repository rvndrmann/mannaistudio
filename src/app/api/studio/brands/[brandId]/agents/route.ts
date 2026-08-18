import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandAgentInputSchema, builtinBrandAgent, resolveBrandAgents } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

/**
 * Saves an agent. A key that matches a built-in edits that built-in's brief
 * instead of adding a rival agent with the same job.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const input = brandAgentInputSchema.parse(await request.json())
    const builtin = builtinBrandAgent(input.agent_key)
    const { error } = await context.supabase
      .from("creator_brand_agents")
      .upsert({ ...input, brand_id: brandId }, { onConflict: "brand_id,agent_key" })
    if (error) throw error

    const { data: rows, error: readError } = await context.supabase.from("creator_brand_agents").select("*").eq("brand_id", brandId).order("created_at", { ascending: true })
    if (readError) throw readError
    return NextResponse.json({ agents: resolveBrandAgents(rows || []), replacedBuiltin: Boolean(builtin) }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid agent", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the agent") }, { status: studioErrorStatus(error) })
  }
}
