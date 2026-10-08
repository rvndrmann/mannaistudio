import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const service = createServiceClient()
    const { data: course, error: courseError } = await service.from("courses").select("id,is_published,is_paused").eq("id", id).maybeSingle()
    if (courseError) throw courseError
    if (!course || !course.is_published || course.is_paused) return NextResponse.json({ error: "Course not found." }, { status: 404 })
    const { data: allowed, error: accessError } = user ? await supabase.rpc("can_access_course", { p_course_id: id }) : { data: false, error: null }
    if (accessError) throw accessError
    const { data: lessons, error } = await service.from("lessons")
      .select("*").eq("course_id", id).order("order", { ascending: true })
    if (error) throw error
    const hydrated = await Promise.all((lessons || []).map(async lesson => {
      if (!allowed) return { id: lesson.id, title: lesson.title, duration: lesson.duration, order: lesson.order }
      if (!lesson.video_url) return lesson
      const raw = String(lesson.video_url)
      const ownPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/`
      // Existing stored public URLs are canonical identifiers, not download URLs.
      const path = raw.startsWith(ownPrefix) ? decodeURIComponent(raw.slice(ownPrefix.length).split("?")[0]) : !/^https?:\/\//i.test(raw) ? raw : null
      if (path) {
        const { data: signed, error: signError } = await supabase.storage.from("videos").createSignedUrl(path, 15 * 60)
        if (signError) throw signError
        return { ...lesson, video_url: signed.signedUrl }
      }
      return lesson // External embeds remain governed by the external host.
    }))
    return NextResponse.json({ lessons: hydrated, accessible: Boolean(allowed) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not load course lessons." }, { status: 503 })
  }
}
