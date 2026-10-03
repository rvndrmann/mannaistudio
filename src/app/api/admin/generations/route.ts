import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isAdminUser } from "@/lib/membership"
import { pollImages } from "@/lib/studio/poll-images"
import { pollVideos } from "@/lib/studio/poll-videos"
import { withCredential } from "@/lib/byok/credential-service"
import { runWithCredential } from "@/lib/byok/active-credential"
import { byokProviderFor } from "@/lib/byok/providers"

export const dynamic = "force-dynamic"
async function adminService() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user || !await isAdminUser(client, user.id)) return null
  return createServiceClient()
}
export async function GET() {
  const service = await adminService()
  if (!service) return NextResponse.json({ error: "Admins only" }, { status: 403 })
  const { data, error } = await service.from("creator_generation_jobs").select("id,project_id,type,provider,model,status,provider_job_id,result_url,error,created_at").order("created_at", { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: "Could not load generation jobs" }, { status: 500 })
  return NextResponse.json({ jobs: data })
}
export async function POST(request: NextRequest) {
  try {
    const service = await adminService()
    if (!service) return NextResponse.json({ error: "Admins only" }, { status: 403 })
    const { jobId } = z.object({ jobId: z.string().uuid() }).strict().parse(await request.json())
    const { data: job, error } = await service.from("creator_generation_jobs").select("*").eq("id", jobId).single()
    if (error || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
    if (!job.provider_job_id) return NextResponse.json({ error: "No provider ID was saved. Re-poll cannot recover synchronous requests or submissions without an ID." }, { status: 409 })
    if (!["image", "video"].includes(job.type)) return NextResponse.json({ error: "Unsupported generation type" }, { status: 400 })
    const { data: project } = await service.from("creator_projects").select("*").eq("id", job.project_id).single()
    const { data: { user } } = await service.auth.admin.getUserById(job.user_id)
    if (!project || !user) return NextResponse.json({ error: "Generation owner or project unavailable" }, { status: 404 })
    const poll = () => (job.type === "image" ? pollImages : pollVideos)(new NextRequest(`http://localhost/recovery?jobId=${job.id}`), { params: Promise.resolve({ projectId: job.project_id }) }, { supabase: service, user, project }, true)
    const provider = byokProviderFor(job.provider)
    if (job.billing_mode === "byok") {
      if (!provider) return NextResponse.json({ error: "Unknown provider credential" }, { status: 409 })
      const result = await withCredential({ userId: user.id, provider }, (parts) => runWithCredential(provider, parts, poll))
      return result ?? NextResponse.json({ error: "The original owner's provider key is no longer connected" }, { status: 409 })
    }
    return await poll()
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Re-poll failed" }, { status: error instanceof z.ZodError ? 400 : 500 })
  }
}
