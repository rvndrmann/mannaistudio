import { createClient } from "@/lib/supabase/client"
import { rendersOnEdgeFunction } from "./image-render-host"

/**
 * Sends one image generation to whichever host can finish it.
 *
 * Most models render on the app's own host: it stops a request at thirty
 * seconds, but those renders are submitted to OpenAI as background responses,
 * so a killed request leaves a handle the job poll finishes from. The picture
 * survives; only the wait is ugly.
 *
 * A model with no such handle has nothing to recover — see rendersOnEdgeFunction
 * — so its render goes straight to the Supabase Edge Function, where the budget
 * is a hundred and fifty seconds. That is the same hop, for the same reason, as
 * the Director turn, and it carries the user's own access token: the generation
 * runs with exactly their permissions, and row-level security bounds every read
 * and write it makes just as it does in the browser.
 *
 * One function rather than a choice at each call site. There are three of them —
 * the shot panel, the asset panel and draw-to-edit — and a fourth will be added
 * one day by someone who has never heard of any of this.
 */
export async function requestProjectImage(projectId: string, body: Record<string, unknown>): Promise<Response> {
  const model = typeof body.model === "string" ? body.model : ""
  if (!rendersOnEdgeFunction(model)) {
    return fetch(`/api/studio/projects/${projectId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Deliberately not a fall back to the app's own host. That host cannot finish
  // this render — it would take the credits, lose the picture, and report a
  // gateway error — so a misconfigured build should say what is wrong instead
  // of failing in a way that costs the user money to discover.
  if (!supabaseUrl) throw new Error(`${model} renders on the image Edge Function, and NEXT_PUBLIC_SUPABASE_URL is not set in this build.`)

  const { data: { session } } = await createClient().auth.getSession()
  if (!session?.access_token) throw new Error("Your session has expired. Sign in again to keep going.")

  try {
    return await fetch(`${supabaseUrl}/functions/v1/render-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ projectId, ...body }),
    })
  } catch (error) {
    // In local development, the local dev server has no 30s timeout and can execute the render directly.
    if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      console.warn("Edge function fetch failed in local dev, falling back to local /api/studio route:", error)
      return fetch(`/api/studio/projects/${projectId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    }
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      throw new Error(`Could not connect to the image render service (${supabaseUrl}/functions/v1/render-image). Please verify your network connection.`)
    }
    throw error
  }
}
