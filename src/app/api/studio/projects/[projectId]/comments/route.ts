import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { requireAuthenticatedProject, studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"
import { enterpriseNotesActive } from "@/lib/enterprise"

/**
 * Revision notes, shared by an enterprise client and the producing team.
 *
 * A note targets a shot, an entity, or the project itself — a client reviewing a
 * delivered cut has notes about one frame, about a character across every frame
 * it appears in, and about the edit as a whole, and only the first of those used
 * to have anywhere to live.
 *
 * Project access is established by requireAuthenticatedProject and the table's
 * own policies; accepting an enterprise order adds the producing admin as a
 * project member, so the team reaches these through the same door as any
 * collaborator. What is checked *here* is the engagement itself: reading is open
 * to anyone on the project, but writing requires an accepted order, so the panel
 * on a project nobody hired us for is a description of the service rather than a
 * conversation with nobody on the other end.
 */

const targetSchema = {
  shotId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
}

const createSchema = z.object({
  ...targetSchema,
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
    const entityId = request.nextUrl.searchParams.get("entityId")
    const scope = request.nextUrl.searchParams.get("scope")

    let query = context.supabase
      .from("creator_shot_comments")
      .select("id,shot_id,entity_id,parent_id,author_id,body,resolved_at,resolved_by,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(500)
    if (shotId) query = query.eq("shot_id", shotId)
    else if (entityId) query = query.eq("entity_id", entityId)
    // The project thread is the notes that name nothing else. Without both
    // filters it would also return every shot and entity note in the project.
    else if (scope === "project") query = query.is("shot_id", null).is("entity_id", null)

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

    return NextResponse.json({
      comments: comments || [],
      authors,
      viewerId: context.user.id,
      // The panel renders itself from this rather than deciding locally, so the
      // rule about who may leave a note lives in one place.
      notesActive: enterpriseNotesActive(context.project.enterprise_status),
      enterpriseStatus: context.project.enterprise_status ?? null,
    })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not load revision notes") }, { status: studioErrorStatus(error) })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = createSchema.parse(await request.json())

    if (!enterpriseNotesActive(context.project.enterprise_status)) {
      return NextResponse.json(
        { error: "Revision notes open once our team accepts your project. Hire the team to start a conversation here." },
        { status: 403 },
      )
    }
    if (input.shotId && input.entityId) {
      return NextResponse.json({ error: "A note belongs to one thing, not two" }, { status: 400 })
    }

    // The target has to belong to this project. Without this, a member of one
    // project could hang a note on any id they could guess and the denormalised
    // project_id would make it look native to their own board.
    if (input.shotId) {
      const { data: shot } = await context.supabase
        .from("creator_shots")
        .select("id,creator_episodes!inner(project_id)")
        .eq("id", input.shotId)
        .eq("creator_episodes.project_id", projectId)
        .maybeSingle()
      if (!shot) return NextResponse.json({ error: "Shot not found in this project" }, { status: 404 })
    }
    if (input.entityId) {
      const { data: entity } = await context.supabase
        .from("creator_entities")
        .select("id")
        .eq("id", input.entityId)
        .eq("project_id", projectId)
        .maybeSingle()
      if (!entity) return NextResponse.json({ error: "Asset not found in this project" }, { status: 404 })
    }

    let parentId = input.parentId
    if (parentId) {
      const { data: parent } = await context.supabase
        .from("creator_shot_comments")
        .select("id,shot_id,entity_id,parent_id")
        .eq("id", parentId)
        .eq("project_id", projectId)
        .maybeSingle()
      if (!parent) return NextResponse.json({ error: "The note you replied to no longer exists" }, { status: 404 })
      if ((parent.shot_id ?? null) !== (input.shotId ?? null) || (parent.entity_id ?? null) !== (input.entityId ?? null)) {
        return NextResponse.json({ error: "That reply belongs to a different thread" }, { status: 400 })
      }
      // One level deep: a reply to a reply is folded onto the note that started
      // the thread rather than rejected, because to the person typing it there
      // is only ever one conversation.
      if (parent.parent_id) parentId = parent.parent_id
    }

    const { data, error } = await context.supabase
      .from("creator_shot_comments")
      .insert({
        shot_id: input.shotId ?? null,
        entity_id: input.entityId ?? null,
        project_id: projectId,
        author_id: context.user.id,
        parent_id: parentId ?? null,
        body: input.body,
      })
      .select("id,shot_id,entity_id,parent_id,author_id,body,resolved_at,resolved_by,created_at")
      .single()
    if (error) throw error

    return NextResponse.json({ comment: data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Write something before sending" }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not post the note") }, { status: studioErrorStatus(error) })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const context = await requireAuthenticatedProject(projectId)
    const input = patchSchema.parse(await request.json())

    if (!enterpriseNotesActive(context.project.enterprise_status)) {
      return NextResponse.json({ error: "Revision notes are not open on this project." }, { status: 403 })
    }

    const { data, error } = await context.supabase.rpc("set_shot_comment_resolved", {
      p_comment_id: input.commentId,
      p_resolved: input.resolved,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ comment: Array.isArray(data) ? data[0] : data })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    return NextResponse.json({ error: studioErrorMessage(error, "Could not update the note") }, { status: studioErrorStatus(error) })
  }
}
