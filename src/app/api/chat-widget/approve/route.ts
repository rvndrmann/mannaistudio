import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getUserCredits } from "@/lib/studio/credits"
import { projectCostSettings } from "@/lib/studio/cost-estimate"
import { estimateProductionCost, estimateScriptShots } from "@/lib/studio/production-estimate"
import { normalizeScriptContent } from "@/lib/studio/script"

const approvalSchema = z.object({
  projectId: z.string().uuid(),
  episodeId: z.string().uuid(),
  secondsPerShot: z.number().int().min(1).max(30).default(6),
}).strict()

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in before approving production." }, { status: 401 })

  const input = approvalSchema.parse(await request.json())
  const [{ data: project }, { data: episode }] = await Promise.all([
    supabase.from("creator_projects").select("*").eq("id", input.projectId).eq("user_id", user.id).maybeSingle(),
    supabase.from("creator_episodes").select("id,script_content").eq("id", input.episodeId).eq("project_id", input.projectId).maybeSingle(),
  ])
  if (!project || !episode) return NextResponse.json({ error: "Production not found." }, { status: 404 })

  const settings = projectCostSettings(project)
  const script = normalizeScriptContent(episode.script_content)
  const { data: projectEntities } = await supabase.from("creator_entities").select("reference_images").eq("project_id", project.id)
  const assetCount = (projectEntities || []).filter((entity) => !Array.isArray(entity.reference_images) || entity.reference_images.length === 0).length
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basic = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  const estimate = estimateProductionCost({
    shotCount: estimateScriptShots(script),
    secondsPerShot: input.secondsPerShot,
    imageModel: settings.imageModel,
    videoModel: settings.videoModel,
    resolution: settings.resolution,
    imageQuality: settings.imageQuality,
    aspectRatio: settings.aspectRatio,
    assetCount,
    assetImageModel: typeof basic.characterImageModel === "string" ? basic.characterImageModel : settings.imageModel,
  })
  const balance = await getUserCredits(user.id, supabase)
  if (balance < estimate.totalCredits) {
    return NextResponse.json({ error: `You need ${estimate.totalCredits - balance} more credits before starting.`, estimate, balance }, { status: 402 })
  }

  return NextResponse.json({ approved: true, estimate, balance, startUrl: `/studio/project/${project.id}?start=production` })
}
