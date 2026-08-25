// A throwaway probe. It answers one question before anything is ported: can a
// Supabase Edge Function on this project run far past the thirty seconds that
// Netlify allows, while doing the kind of work the Director does — npm imports,
// a database round trip, and an outbound HTTPS call.
import { createClient } from "npm:@supabase/supabase-js@2"
import { z } from "npm:zod@3"

Deno.serve(async (request) => {
  const started = Date.now()
  const seconds = Number(new URL(request.url).searchParams.get("seconds") || 45)
  const schema = z.object({ ok: z.boolean() })
  const marks: string[] = []

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Mostly-idle waiting with periodic work, which is the shape of an agent turn:
  // long wall-clock, very little CPU.
  while ((Date.now() - started) / 1000 < seconds) {
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    const { error } = await supabase.from("site_settings").select("key").limit(1)
    marks.push(`${Math.round((Date.now() - started) / 1000)}s db=${error ? "err" : "ok"}`)
  }

  // An outbound call, to prove the network egress the providers need.
  let egress = "not attempted"
  try {
    const response = await fetch("https://api.openai.com/v1/models", { method: "GET" })
    egress = `openai reachable (${response.status})`
  } catch (error) {
    egress = `openai unreachable: ${error}`
  }

  return Response.json({
    zodWorks: schema.safeParse({ ok: true }).success,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    marks,
    egress,
  })
})
