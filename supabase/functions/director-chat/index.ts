import { createClient } from "@supabase/supabase-js"
import {
  describeError,
  directorChatInputSchema,
  executeDirectorTurn,
  prepareDirectorTurn,
  requireAuthenticatedProject,
  resolveDirectorTurn,
} from "./_turn.js"

/**
 * One Director turn, run where it is allowed to take as long as it takes.
 *
 * The host serving the rest of the app stops a request at thirty seconds and
 * real turns take between thirty-six and fifty-one, measured — so on that host
 * a turn is killed mid-flight, having done and paid for most of its work. Here
 * the budget is a hundred and fifty seconds, also measured. Nothing about the
 * turn changes; only how long it is permitted to run.
 *
 * The security model is deliberately plainer than the Netlify attempt it
 * replaces, which needed a shared secret and signed jobs because one server was
 * speaking for a user to another server. Nothing speaks for anyone here:
 *
 *   - Supabase verifies the caller's JWT before this code runs at all.
 *   - The turn then runs on a client built from that same token, so row-level
 *     security bounds every read and write exactly as it does in the browser.
 *     A project shared with someone behaves identically either way.
 *   - The service role key is never used. It would see everything, and nothing
 *     here needs to.
 *
 * There is no secret to leak and no signature to forge, because there is no
 * privileged path to protect.
 */

/** Where the browser may call from. Not "*": a token is being sent. */
const allowedOrigins = new Set([
  "https://www.aidirectorhub.com",
  "https://aidirectorhub.com",
  "http://localhost:3000",
])

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://www.aidirectorhub.com"
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

Deno.serve(async (request: Request) => {
  const cors = corsHeaders(request.headers.get("origin"))
  if (request.method === "OPTIONS") return new Response(null, { headers: cors })
  if (request.method !== "POST") {
    return Response.json({ error: "Use POST" }, { status: 405, headers: cors })
  }

  const authorization = request.headers.get("Authorization") || ""
  if (!authorization.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors })
  }

  try {
    const body = directorChatInputSchema.parse(await request.json())

    // The caller's own token, never the service role. Every read and write this
    // turn makes is bounded by what that user may see.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    )

    const context = await requireAuthenticatedProject(body.projectId, supabase)

    // The same preconditions the Next.js route applies, from the same function,
    // so the two callers cannot come to different answers about whether an
    // episode, an entity or a paused model is acceptable.
    const resolved = await resolveDirectorTurn(context, body)
    if (resolved.refused) {
      return Response.json({ error: resolved.refused.error }, { status: resolved.refused.status, headers: cors })
    }

    const prepared = await prepareDirectorTurn({
      context,
      episode: resolved.episode,
      sessionId: resolved.sessionId,
      model: resolved.model,
      message: body.message,
      modelMessage: resolved.modelMessage,
      mentionedEntities: resolved.mentionedEntities,
      uniqueMentionIds: resolved.uniqueMentionIds,
      idempotencyKey: body.idempotencyKey,
    })

    if (!body.stream) {
      const result = await executeDirectorTurn(prepared)
      return Response.json(result, { headers: cors })
    }

    // The same event stream the Next.js route speaks, so the workspace reads
    // this path with the code it already has: text deltas as they arrive, each
    // tool as it starts and finishes, then one closing event.
    //
    // Streaming here does not put the turn back at the mercy of the browser.
    // The run is persisted as it goes and this runtime keeps working when a
    // reader leaves, so a closed tab costs the live text and nothing else — the
    // reply still lands, and the workspace still picks it up over Realtime.
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { /* the reader left */ }
        }
        try {
          send({ type: "start", sessionId: resolved.sessionId })
          send({ type: "done", ...(await executeDirectorTurn(prepared, send)) })
        } catch (error) {
          console.error("director-chat stream failed:", error)
          send({ type: "error", error: describeError(error, "AI Director chat failed") })
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    })
  } catch (error) {
    console.error("director-chat failed:", error)
    const status = (error as { status?: number })?.status
    return Response.json(
      { error: describeError(error, "AI Director chat failed") },
      { status: typeof status === "number" ? status : 500, headers: cors },
    )
  }
})
