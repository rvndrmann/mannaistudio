import { Buffer } from "node:buffer"
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer: unknown }).Buffer = Buffer
}

import { createClient } from "@supabase/supabase-js"
import {
  imageGenerationErrorResponse,
  imageRequestSchema,
  renderProjectImage,
  requireAuthenticatedProject,
} from "./_render.js"
import { corsHeaders } from "../_shared/cors.ts"

/**
 * One image generation, run where it is allowed to take as long as it takes.
 *
 * The host serving the rest of the app stops a request at thirty seconds. Most
 * image models survive that anyway: their renders are submitted to OpenAI as
 * background responses, so a request killed mid-render leaves behind an id the
 * job poll finishes from, and the picture is waited for rather than lost.
 *
 * GPT Image 2.5 Sunburst has no such id — OpenAI serves it only on
 * /v1/images/generations and /v1/images/edits — so its render is held on the
 * connection, and on that host it was killed every single time: the image lost
 * though OpenAI had rendered and billed it, the credits returned six minutes
 * later by the stalled-job sweep, and the user shown the host's own error page
 * in the meantime. Here the budget is a hundred and fifty seconds and a healthy
 * render takes fifty to seventy-five.
 *
 * The security model is the Director function's, for the same reasons:
 *
 *   - Supabase verifies the caller's JWT before this code runs at all.
 *   - The generation then runs on a client built from that same token, so
 *     row-level security bounds every read and write exactly as it does in the
 *     browser. A project shared with someone behaves identically either way.
 *   - The service role key is never used. It would see everything, and nothing
 *     here needs to.
 *
 * There is no secret to leak and no signature to forge, because there is no
 * privileged path to protect.
 */
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
    // The project is addressed in the body here rather than in the path, and it
    // is taken out before the rest is validated: the request schema is strict,
    // so leaving it in would fail every render as an unrecognised field.
    const { projectId, ...rest } = await request.json() as { projectId?: unknown }
    if (typeof projectId !== "string" || !projectId) {
      return Response.json({ error: "Which project?" }, { status: 400, headers: cors })
    }
    const input = imageRequestSchema.parse(rest)

    // The caller's own token, never the service role. Every read and write this
    // generation makes is bounded by what that user may see.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    )

    const context = await requireAuthenticatedProject(projectId, supabase)
    const result = await renderProjectImage(context, projectId, input)
    return Response.json(result, { headers: cors })
  } catch (error) {
    // The same body and status the app's own route answers with, from the same
    // function: a failure has to read identically whichever host produced it,
    // or the workspace shows two different stories for one broken render.
    const { body, status } = imageGenerationErrorResponse(error)
    console.error("render-image failed", status, body.error)
    return Response.json(body, { status, headers: cors })
  }
})
