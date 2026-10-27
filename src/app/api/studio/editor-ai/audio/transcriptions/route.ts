import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { hasCredential, withCredential } from "@/lib/byok/credential-service"
import { assertAllowedProviderUrl } from "@/lib/byok/providers"
import { userFromBearer } from "@/lib/studio/editor-ai-server"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// The editor sends a minute of 16 kHz mono WAV at a time (≈1.9 MB).
const MAX_AUDIO_BYTES = 5 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 110_000
// Fixed here; never taken from the request. whisper-1 is the transcription
// model that returns timed segments (verbose_json), which captions need.
const UPSTREAM = "https://api.openai.com/v1/audio/transcriptions"
const MODEL = "whisper-1"

function failure(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status })
}

/**
 * Caption transcription for the Timeline editor, on the caller's own OpenAI
 * key (see editor/openreel/overlay/.../studio-captions). Like the editor's
 * chat proxy, it bills no credits: without a saved OpenAI key it refuses.
 * Returns only the text and its timed segments.
 */
export async function POST(request: NextRequest) {
  const user = await userFromBearer(request)
  if (!user) return failure(401, "Your session has expired. Reload the studio.")

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return failure(400, "Expected the clip's audio as a form upload.")
  }
  const file = form.get("file")
  if (!(file instanceof Blob) || !file.size) return failure(400, "The clip has no audio to transcribe.")
  if (file.size > MAX_AUDIO_BYTES) return failure(413, "The audio piece is too large.")
  const language = String(form.get("language") || "").trim().toLowerCase()

  if (!(await hasCredential(user.id, "openai"))) {
    return failure(403, "Add your OpenAI key under API keys to make captions with it, or switch to the in-browser model.")
  }

  assertAllowedProviderUrl("openai", UPSTREAM)
  const upstream = new FormData()
  upstream.append("file", file, "clip.wav")
  upstream.append("model", MODEL)
  upstream.append("response_format", "verbose_json")
  upstream.append("timestamp_granularities[]", "segment")
  if (/^[a-z]{2}$/.test(language)) upstream.append("language", language)

  try {
    const result = await withCredential({ userId: user.id, provider: "openai" }, async (parts) => {
      const response = await fetch(UPSTREAM, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${parts.apiKey}`,
          "OpenAI-Safety-Identifier": createHash("sha256").update(user.id).digest("hex"),
        },
        body: upstream,
      })
      // A provider's error body can echo the request's credentials; only the
      // status is passed on.
      if (!response.ok) return { status: response.status, json: null }
      return { status: 200, json: await response.json() as { text?: unknown; segments?: unknown } }
    })
    if (!result) return failure(403, "Your OpenAI key is not available right now. Check API keys.")
    if (!result.json) return failure(result.status, `OpenAI returned HTTP ${result.status}. Check the key's quota and that it can use ${MODEL}.`)
    const segments = Array.isArray(result.json.segments)
      ? result.json.segments
          .map((segment) => segment as { start?: unknown; end?: unknown; text?: unknown })
          .filter((segment) => typeof segment.start === "number" && typeof segment.end === "number" && typeof segment.text === "string")
          .map((segment) => ({ start: segment.start as number, end: segment.end as number, text: segment.text as string }))
      : []
    return NextResponse.json({ text: typeof result.json.text === "string" ? result.json.text : "", segments })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    console.error("[editor-ai] Transcription failed:", timedOut ? "timeout" : error)
    return failure(timedOut ? 504 : 502, timedOut ? "OpenAI did not answer in time." : "OpenAI could not be reached.")
  }
}
