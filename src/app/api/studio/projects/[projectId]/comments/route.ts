import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

/**
 * Revision notes on a shot, shared by the client and the producing team.
 *
 * Access is not checked here beyond the project itself: requireAuthenticatedProject
 * establishes that the caller can open the project, and the table's own policies
 * do the rest. Accepting an enterprise order adds the producing admin as a
 * project member, so the team reaches these notes through the same door as any
 * collaborator.
 */

const createSchema = z.object({
  shotId: z.string().uuid(),
  body: z.string().trim().min(1).max(5_000),
  /** Set to reply to an existing note. Replies are one level deep. */
  parentId: z.string().uuid().optional(),
}).strict()

const patchSchema = z.object({
  commentId: z.string().uuid(),
  resolved: z.boolean(),
}).strict()

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const shotId = request.nextUrl.searchParams.get("shotId")

    let query = context.supabase
      .from("creator_shot_comments")
      .select("id,shot_id,parent_id,author_id,body,resolved_at,resolved_by,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(500)
    if (shotId) query = query.eq("shot_id", shotId)

    const { data: comments, error } = await query
    if (error) throw error

    // Names, resolved in one round trip. Without them the panel shows a wall of
    // uuids and nobody can tell the client's note from the team's answer.
    const authorIds = Array.from(new Set((comments || []).flatMap((comment) => [comment.author_id, comment.resolved_by]).filter((id): id is string => Boolean(id))))
    const { data: profiles } = authorIds.length
      ? await context.supabase.from("profiles").select("id,full_name,email").in("id", authorIds)
      : { data: [] }
    const authors = Object.fromEntries((profiles || []).map((profile) => [profile.id, {
      id: profile.id,
      name: profile.full_name || profile.email || "Someone",
    }]))

    return NextResponse.json({ comments: comments || [], authors, viewerId: context.user.id })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not load comments") }, { status: studioErrorStatus(error) })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = createSchema.parse(await request.json())

    // The shot has to belong to this project. Without this a member of one
    // project could hang a note on any shot id they could guess, and the
    // denormalised project_id would make it look native to their own board.
    const { data: shot } = await context.supabase
      .from("creator_shots")
      .select("id,episode_id,creator_episodes!inner(project_id)")
      .eq("id", input.shotId)
      .eq("creator_episodes.project_id", projectId)
      .maybeSingle()
    if (!shot) return NextResponse.json({ error: "Shot not found in this project" }, { status: 404 })

    if (input.parentId) {
      const { data: parent } = await context.supabase
        .from("creator_shot_comments")
        .select("id,shot_id,parent_id")
        .eq("id", input.parentId)
        .eq("project_id", projectId)
        .maybeSingle()
      if (!parent) return NextResponse.json({ error: "The note you replied to no longer exists" }, { status: 404 })
      if (parent.shot_id !== input.shotId) return NextResponse.json({ error: "That reply belongs to a different shot" }, { status: 400 })
      // One level deep: a reply to a reply is flattened onto the note that
      // started the thread rather than rejected, because to the person typing it
      // there is only ever one conversation.
      if (parent.parent_id) input.parentId = parent.parent_id
    }

    const { data, error } = await context.supabase
      .from("creator_shot_comments")
      .insert({
        shot_id: input.shotId,
        project_id: projectId,
        author_id: context.user.id,
        parent_id: input.parentId ?? null,
        body: input.body,
      })
      .select("id,shot_id,parent_id,author_id,body,resolved_at,resolved_by,created_at")
      .single()
    if (error) throw error

    return NextResponse.json({ comment: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Write something before sending" }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not post the comment") }, { status: studioErrorStatus(error) })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = patchSchema.parse(await request.json())

    const { data, error } = await context.supabase.rpc("set_shot_comment_resolved", {
      p_comment_id: input.commentId,
      p_resolved: input.resolved,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ comment: Array.isArray(data) ? data[0] : data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not update the comment") }, { status: studioErrorStatus(error) })
  }
}
