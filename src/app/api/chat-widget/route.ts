import type { SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { activeDirectorModels } from "@/lib/studio/ai-models"
import { executeBrandTool, loadBrandBriefingMaterial } from "@/lib/studio/brand-server"
import { BrandHandoffError, sendBrandScriptToProject } from "@/lib/studio/brand-handoff"
import { getUserCredits } from "@/lib/studio/credits"
import { projectCostSettings } from "@/lib/studio/cost-estimate"
import { estimateProductionCost, estimateScriptShots } from "@/lib/studio/production-estimate"
import { normalizeScriptContent } from "@/lib/studio/script"
import {
  buildMemberWidgetInstructions,
  buildProductionProposal,
  memberWidgetTools,
  widgetProposeSchema,
  widgetScriptToolSchema,
  widgetSendToProjectSchema,
  type ProductionProposal,
} from "@/lib/studio/widget-agent"
import { describeError } from "@/lib/studio/errors"
import { createGoogleDirectorToolTurn, GoogleProviderError } from "@/lib/studio/google"
import {
  appendTranscript,
  applyLeadCapture,
  buildLeadWidgetInstructions,
  captureLeadSchema,
  leadCaptureToolDefinition,
  leadIsReachable,
  leadWidgetHourlyLimit,
  leadWidgetInputSchema,
  leadWidgetSessionMessageLimit,
  transcriptHistory,
  visitorKey,
  widgetGreeting,
  type LeadFields,
} from "@/lib/studio/lead-widget"
import { createDirectorToolTurn, defaultOpenAIDirectorModel, OpenAIProviderError } from "@/lib/studio/openai"
import type { BrandRecord } from "@/lib/studio/brand"

// One reply, plus at most one capture round trip.
export const maxDuration = 60
const MAX_TOOL_STEPS = 2
// Record, write, send, quote, answer. The member path walks a pipeline rather
// than answering one question.
const MEMBER_TOOL_STEPS = 6

type WidgetBrand = BrandRecord & { id: string; widget_enabled: boolean; widget_greeting: string; widget_agent_key: string }

/**
 * The brand whose widget is live.
 *
 * More than one brand can have the switch on — a user experimenting with a
 * second brand room should not silently take over the site — so the most
 * recently updated one wins, and that is the one the Brand panel just saved.
 */
async function liveWidgetBrand(db: ReturnType<typeof createServiceClient>) {
  const { data } = await db
    .from("creator_brands")
    .select("*")
    .eq("widget_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as WidgetBrand | null) || null
}

function callerKey(request: NextRequest) {
  // Behind a proxy the first forwarded address is the client; the platform
  // header is used when there is no proxy in front of us at all.
  const forwarded = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown"
  const agent = request.headers.get("user-agent") || ""
  // Falls back to the anon key so a missing secret cannot turn the hash into a
  // plain unsalted digest of somebody's address.
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "widget"
  return visitorKey(ip, agent, salt)
}

/** Whether to show the bubble at all, and what it opens with. */
export async function GET() {
  try {
    // A signed-in visitor always gets the bubble: for them it is the studio
    // assistant, and it does not depend on anybody having switched a brand's
    // public widget on.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const name = String(user.user_metadata?.full_name || "").split(" ")[0]
      return NextResponse.json({
        enabled: true,
        member: true,
        greeting: `${name ? `Hi ${name}` : "Hi"} — tell me what you want to make and I'll write it, open the production, and show you what it costs.`,
      })
    }

    const db = createServiceClient()
    const brand = await liveWidgetBrand(db)
    if (!brand) return NextResponse.json({ enabled: false })
    return NextResponse.json({ enabled: true, member: false, brandName: brand.name, greeting: widgetGreeting(brand) })
  } catch (error) {
    // A missing service role must not break the marketing page; the widget
    // simply does not appear.
    console.warn("Chat widget is unavailable:", error)
    return NextResponse.json({ enabled: false })
  }
}

/**
 * The signed-in half of the widget.
 *
 * Everything here runs on the user's own Supabase client, so RLS is what
 * decides which brand and which project they can touch — the service role that
 * powers the anonymous side is never used to write on a member's behalf.
 */
async function runMemberTurn(request: NextRequest, input: ReturnType<typeof leadWidgetInputSchema.parse>, key: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Their own brand room, created on first use: the point of this widget is
  // that they never have to go and open one.
  let { data: brand } = await supabase.from("creator_brands").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle()
  if (!brand) {
    const name = String(user.user_metadata?.full_name || user.email?.split("@")[0] || "My brand").slice(0, 160)
    const { data: created, error } = await supabase.from("creator_brands").insert({ user_id: user.id, name }).select("*").single()
    if (error) throw error
    brand = created
  }

  const balance = await getUserCredits(user.id, supabase)
  const { knowledge, assets } = await loadBrandBriefingMaterial(supabase, brand.id)
  const instructions = buildMemberWidgetInstructions({ brand, knowledge, assets, balance, userName: user.user_metadata?.full_name })

  const { data: session } = input.sessionId
    ? await supabase.from("brand_lead_sessions").select("*").eq("id", input.sessionId).eq("brand_id", brand.id).eq("visitor_key", key).maybeSingle()
    : { data: null }
  let currentSession = session
  if (!currentSession) {
    const { data, error } = await supabase
      .from("brand_lead_sessions")
      .insert({ brand_id: brand.id, visitor_key: key, source_path: input.sourcePath, name: String(user.user_metadata?.full_name || ""), email: user.email || "", captured_at: new Date().toISOString() })
      .select("*")
      .single()
    if (error) throw error
    currentSession = data
  }
  if ((currentSession.message_count || 0) >= leadWidgetSessionMessageLimit) {
    return NextResponse.json({ error: "This chat has reached its message limit. Start a new chat to continue." }, { status: 429 })
  }
  const limiter = createServiceClient()
  const { data: allowed } = await limiter.rpc("consume_public_rate_limit", {
    p_visitor_key: `member:${user.id}:${key}`,
    p_bucket: "member-widget-hour",
    p_limit: leadWidgetHourlyLimit,
    p_window_seconds: 3600,
  })
  if (!allowed) return NextResponse.json({ error: "Too many messages. Please try again later." }, { status: 429 })

  const model = await widgetModel(supabase)
  const items: Array<Record<string, unknown>> = [
    ...transcriptHistory(currentSession.transcript),
    { role: "user", content: input.message },
  ]
  const tools = memberWidgetTools()
  let content = ""
  let proposal: ProductionProposal | null = null
  let lastScriptId = ""
  // Set the moment a production is opened, so the chat can link to it even if
  // the quote that normally follows never gets made.
  let openedProject: { id: string; name: string } | null = null

  for (let step = 0; step < MEMBER_TOOL_STEPS; step += 1) {
    const turn = model.startsWith("gemini")
      ? await createGoogleDirectorToolTurn({ userId: user.id, model, instructions, items, tools })
      : await createDirectorToolTurn({ userId: user.id, model, instructions, items, tools })
    if (turn.content) content = turn.content
    if (!turn.calls.length) break

    for (const call of turn.calls) {
      items.push({ type: "function_call", call_id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments), thoughtSignature: call.thoughtSignature })
    }

    for (const call of turn.calls) {
      let output: Record<string, unknown>
      try {
        if (call.name === "save_script") {
          const draft = widgetScriptToolSchema.parse(call.arguments ?? {})
          const { data, error } = await supabase
            .from("creator_brand_scripts")
            .insert({
              brand_id: brand.id,
              title: draft.title,
              status: "draft",
              content: normalizeScriptContent({ title: draft.title, overview: draft.overview, body: draft.body }),
            })
            .select("id,title")
            .single()
          if (error) throw error
          lastScriptId = data.id
          output = { script_id: data.id, title: data.title, note: "Saved. Now call send_script_to_project with this script_id." }
        } else if (call.name === "send_script_to_project") {
          const args = widgetSendToProjectSchema.parse(call.arguments ?? {})
          const scriptId = args.script_id || lastScriptId
          const { data: script } = scriptId
            ? await supabase.from("creator_brand_scripts").select("*").eq("id", scriptId).eq("brand_id", brand.id).maybeSingle()
            : { data: null }
          if (!script) {
            output = { error: "No saved script to send. Call save_script first." }
          } else {
            const handoff = await sendBrandScriptToProject({
              supabase,
              user,
              brand,
              script: { id: script.id, title: script.title, content: script.content, notes: script.notes },
              projectName: args.project_name,
            })
            await supabase
              .from("creator_brand_scripts")
              .update({ status: "final", sent_project_id: handoff.projectId, sent_episode_id: handoff.episodeId, sent_at: new Date().toISOString() })
              .eq("id", script.id)
            openedProject = { id: handoff.projectId, name: script.title }
            output = {
              project_id: handoff.projectId,
              episode_id: handoff.episodeId,
              imported_assets: handoff.importedEntities,
              note: "The script is in the project and the user can already open it from the chat. Now call propose_production to quote it.",
            }
          }
        } else if (call.name === "propose_production") {
          const args = widgetProposeSchema.parse(call.arguments ?? {})
          const { data: project } = await supabase.from("creator_projects").select("*").eq("id", args.project_id).maybeSingle()
          const { data: episode } = await supabase.from("creator_episodes").select("id,script_content").eq("id", args.episode_id).eq("project_id", args.project_id).maybeSingle()
          if (!project || !episode) {
            output = { error: "That production could not be found. Send the script first." }
          } else {
            // Priced through the project's own settings and the same
            // calculateCreditCost the generation routes bill with, so the card
            // cannot quote a number the studio will not charge.
            const settings = projectCostSettings(project)
            const script = normalizeScriptContent(episode.script_content)
            const { data: projectEntities } = await supabase.from("creator_entities").select("reference_images").eq("project_id", args.project_id)
            const assetCount = (projectEntities || []).filter((entity) => !Array.isArray(entity.reference_images) || entity.reference_images.length === 0).length
            const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
            const basic = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
            const estimate = estimateProductionCost({
              shotCount: estimateScriptShots(script),
              secondsPerShot: args.seconds_per_shot,
              imageModel: settings.imageModel,
              videoModel: settings.videoModel,
              resolution: settings.resolution,
              imageQuality: settings.imageQuality,
              aspectRatio: settings.aspectRatio,
              assetCount,
              assetImageModel: typeof basic.characterImageModel === "string" ? basic.characterImageModel : settings.imageModel,
            })
            proposal = buildProductionProposal({
              projectId: args.project_id,
              episodeId: args.episode_id,
              summary: args.summary || script.title,
              estimate,
              balance: await getUserCredits(user.id, supabase),
            })
            output = { ...proposal.estimate, balance: proposal.balance, shortfall: proposal.shortfall, note: "The approval card is now shown to the user. Tell them what happens when they approve; do not repeat the numbers." }
          }
        } else if (call.name === "get_credit_balance") {
          output = { credits: await getUserCredits(user.id, supabase) }
        } else {
          // update_brand_profile and save_brand_knowledge are the same writes
          // the brand room makes, so they go through the same executor and the
          // same rule about never overwriting the user's own answers.
          const outcome = await executeBrandTool({ supabase, user, brand }, call.name, call.arguments)
          if (outcome.brand) brand = outcome.brand
          output = outcome.result
        }
      } catch (error) {
        // The model paraphrases whatever it is handed, so a swallowed cause
        // reaches the user as "a permissions error" and nobody can act on it.
        // The full object goes to the server log and the exact message goes to
        // the model, which is told to quote it rather than summarise it.
        console.error(`[chat-widget] ${call.name} failed`, JSON.stringify(error, Object.getOwnPropertyNames(error || {})).slice(0, 2_000))
        output = {
          error: error instanceof BrandHandoffError ? error.message : describeError(error, "That step did not work."),
          instruction: "Tell the user this failed and quote the error text above word for word. Do not summarise it, and do not guess at the cause.",
        }
      }
      items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output), thoughtSignature: call.thoughtSignature })
    }
  }

  if (!content.trim()) content = "Sorry — I lost that. Could you say it again?"

  const transcript = appendTranscript(
    appendTranscript(currentSession.transcript, { role: "visitor", content: input.message, at: new Date().toISOString() }),
    { role: "agent", content, at: new Date().toISOString() },
  )
  await supabase
    .from("brand_lead_sessions")
    .update({ transcript, message_count: (currentSession.message_count || 0) + 1 })
    .eq("id", currentSession.id)

  return NextResponse.json({ sessionId: currentSession.id, reply: content, member: true, proposal, project: openedProject })
}

async function widgetModel(db: SupabaseClient) {
  const { data } = await db.from("site_settings").select("value").eq("key", "ai_director_models").maybeSingle()
  const models = activeDirectorModels(data?.value)
  return models.find((item) => item.id === defaultOpenAIDirectorModel())?.id || models[0]?.id || defaultOpenAIDirectorModel()
}

export async function POST(request: NextRequest) {
  try {
    const input = leadWidgetInputSchema.parse(await request.json())
    const key = callerKey(request)

    // A signed-in visitor gets the studio assistant, not the sales agent: they
    // already bought the argument, and what they need now is the work done.
    const memberResponse = await runMemberTurn(request, input, key)
    if (memberResponse) return memberResponse

    const db = createServiceClient()
    const brand = await liveWidgetBrand(db)
    if (!brand) return NextResponse.json({ error: "The chat is not available right now." }, { status: 404 })

    // This endpoint is public and spends money on every call, so the limit is
    // the thing standing between a scraper and the model bill.
    const { data: allowed, error: limitError } = await db.rpc("consume_public_rate_limit", {
      p_visitor_key: key,
      p_bucket: "chat_widget",
      p_limit: leadWidgetHourlyLimit,
      p_window_seconds: 3_600,
    })
    if (limitError) throw limitError
    if (!allowed) {
      return NextResponse.json({ error: "That is a lot of messages. Please try again a little later." }, { status: 429 })
    }

    let session = input.sessionId
      ? (await db.from("brand_lead_sessions").select("*").eq("id", input.sessionId).eq("brand_id", brand.id).maybeSingle()).data
      : null
    if (!session) {
      const { data, error } = await db
        .from("brand_lead_sessions")
        .insert({ brand_id: brand.id, visitor_key: key, source_path: input.sourcePath })
        .select("*")
        .single()
      if (error) throw error
      session = data
    }
    if (session.message_count >= leadWidgetSessionMessageLimit) {
      return NextResponse.json({ error: "This conversation has run long. Please get in touch directly and someone will pick it up." }, { status: 429 })
    }

    const model = await widgetModel(db)

    const { knowledge, assets } = await loadBrandBriefingMaterial(db, brand.id)
    const instructions = buildLeadWidgetInstructions({ brand, knowledge, assets })
    const items: Array<Record<string, unknown>> = [
      ...transcriptHistory(session.transcript),
      { role: "user", content: input.message },
    ]

    let lead: LeadFields = {
      name: session.name || "",
      email: session.email || "",
      phone: session.phone || "",
      company: session.company || "",
      intent: session.intent || "",
    }
    let captured = false
    let content = ""
    const tools = [leadCaptureToolDefinition()]

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const turn = model.startsWith("gemini")
        ? await createGoogleDirectorToolTurn({ userId: key, model, instructions, items, tools })
        : await createDirectorToolTurn({ userId: key, model, instructions, items, tools })
      if (turn.content) content = turn.content
      if (!turn.calls.length) break

      for (const call of turn.calls) {
        items.push({ type: "function_call", call_id: call.callId, name: call.name, arguments: JSON.stringify(call.arguments), thoughtSignature: call.thoughtSignature })
      }
      for (const call of turn.calls) {
        if (call.name !== "capture_lead") {
          items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify({ error: "No such tool." }), thoughtSignature: call.thoughtSignature })
          continue
        }
        const patch = captureLeadSchema.partial().safeParse(call.arguments ?? {})
        const { fields, rejected } = applyLeadCapture(lead, patch.success ? patch.data : {})
        lead = fields
        captured = true
        items.push({
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify(rejected.length ? { saved: true, rejected, note: "That email did not look valid. Read it back to them to check." } : { saved: true }),
          thoughtSignature: call.thoughtSignature,
        })
      }
    }

    if (!content.trim()) content = "Sorry — I lost that. Could you say it again?"

    const transcript = appendTranscript(
      appendTranscript(session.transcript, { role: "visitor", content: input.message, at: new Date().toISOString() }),
      { role: "agent", content, at: new Date().toISOString() },
    )
    await db
      .from("brand_lead_sessions")
      .update({
        ...lead,
        transcript,
        message_count: (session.message_count || 0) + 1,
        // Marked once there is a way to reply. Everything before that is a
        // conversation, not a lead, and counting it as one would fill the list
        // with visitors nobody can contact.
        captured_at: session.captured_at || (leadIsReachable(lead) ? new Date().toISOString() : null),
      })
      .eq("id", session.id)

    return NextResponse.json({ sessionId: session.id, reply: content, captured })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "That message could not be sent." }, { status: 400 })
    if (error instanceof OpenAIProviderError || error instanceof GoogleProviderError) {
      console.error("Chat widget provider error:", error.message)
      return NextResponse.json({ error: "The chat is having trouble right now. Please try again in a moment." }, { status: 502 })
    }
    console.error("Chat widget error:", describeError(error, "unknown"))
    // A visitor is not a developer: they get a sentence, and the detail goes to
    // the server log.
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
