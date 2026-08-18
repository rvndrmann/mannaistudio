import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { brandAgentPatchSchema, resolveBrandAgents } from "@/lib/studio/brand"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

async function readAgents(context: Awaited<ReturnType<typeof requireBrandOwner>>, brandId: string) {
  const { data, error } = await context.supabase.from("creator_brand_agents").select("*").eq("brand_id", brandId).order("created_at", { ascending: true })
  if (error) throw error
  return resolveBrandAgents(data || [])
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ brandId: string; agentKey: string }> }) {
  try {
    const { brandId, agentKey } = await params
    const context = await requireBrandOwner(brandId)
    const patch = brandAgentPatchSchema.parse(await request.json())
    const { error } = await context.supabase.from("creator_brand_agents").update(patch).eq("brand_id", brandId).eq("agent_key", agentKey)
    if (error) throw error
    return NextResponse.json({ agents: await readAgents(context, brandId) })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid agent", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not save the agent") }, { status: studioErrorStatus(error) })
  }
}

/**
 * Deleting only removes the saved row. For a custom agent that is the agent;
 * for an edited built-in it restores the shipped brief, which is what a user
 * pressing delete on the Script Writer actually wants.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ brandId: string; agentKey: string }> }) {
  try {
    const { brandId, agentKey } = await params
    const context = await requireBrandOwner(brandId)
    const { error } = await context.supabase.from("creator_brand_agents").delete().eq("brand_id", brandId).eq("agent_key", agentKey)
    if (error) throw error
    return NextResponse.json({ agents: await readAgents(context, brandId) })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not delete the agent") }, { status: studioErrorStatus(error) })
  }
}
