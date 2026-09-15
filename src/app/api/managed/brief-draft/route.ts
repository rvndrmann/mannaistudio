import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const dynamic = "force-dynamic"

/**
 * A brief, saved while it is still being typed.
 *
 * Deliberately public, for the same reason the analytics beacon is: sign-in
 * happens at checkout, so a route that required a session would only ever see
 * the briefs that were finished — which are exactly the ones already recorded
 * as orders. What it will not do is take the account from the request body.
 * `profile_id` comes from the session cookie, so a draft can claim an owner
 * only by actually being signed in as them.
 *
 * It never fails loudly. This fires while somebody is filling in a form; an
 * error here must not interrupt that, so every outcome but a malformed body is
 * a 204 and the brief carries on regardless.
 */

const saveSchema = z.object({
  type: z.literal("save"),
  visitorId: z.string().uuid(),
  serviceKey: z.string().max(60).default(""),
  packageKey: z.string().max(60).default(""),
  brief: z.record(z.string(), z.unknown()),
  furthestStep: z.number().int().min(0).max(50),
  totalSteps: z.number().int().min(1).max(50),
})

const convertedSchema = z.object({
  type: z.literal("converted"),
  visitorId: z.string().uuid(),
  serviceKey: z.string().max(60).default(""),
  projectId: z.string().uuid(),
})

const bodySchema = z.discriminatedUnion("type", [saveSchema, convertedSchema])

export async function POST(request: NextRequest) {
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid draft" }, { status: 400 })
    return NextResponse.json({ error: "Invalid draft" }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const admin = createServiceClient()

    if (body.type === "converted") {
      await admin.rpc("mark_brief_draft_converted", {
        p_visitor_id: body.visitorId,
        p_service_key: body.serviceKey,
        p_project_id: body.projectId,
      })
      return new NextResponse(null, { status: 204 })
    }

    await admin.rpc("record_brief_draft", {
      p_visitor_id: body.visitorId,
      p_profile_id: user?.id ?? null,
      p_service_key: body.serviceKey,
      p_package_key: body.packageKey,
      p_brief: body.brief,
      p_furthest_step: body.furthestStep,
      p_total_steps: body.totalSteps,
    })
    return new NextResponse(null, { status: 204 })
  } catch {
    // Nothing to say to a form in mid-sentence.
    return new NextResponse(null, { status: 204 })
  }
}
