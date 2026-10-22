import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { hasCredential, withCredential } from "@/lib/byok/credential-service"
import { assertAllowedProviderUrl } from "@/lib/byok/providers"
import { editorAiProviderForModel, editorAiRequestBody, editorAiUpstream, EDITOR_AI_LABEL } from "@/lib/studio/editor-ai"
import { userFromBearer } from "@/lib/studio/editor-ai-server"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_REQUEST_BYTES = 4 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 110_000

function failure(status: number, message: string) {
  return NextResponse.json({ error: { message } }, { status })
}

/**
 * OpenAI-style chat completions for the Timeline editor, on the caller's own
 * key (see lib/studio/editor-ai). Nothing here bills credits: without a saved
 * key for the model's provider the request is refused, never run on ours.
 */
export async function POST(request: NextRequest) {
  const user = await userFromBearer(request)
  if (!user) return failure(401, "Your session has expired. Reload the studio.")

  const text = await request.text()
  if (text.length > MAX_REQUEST_BYTES) return failure(413, "The edit request is too large.")
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return failure(400, "The request is not valid JSON.")
  }

  const model = parsed && typeof parsed === "object" && typeof (parsed as { model?: unknown }).model === "string" ? (parsed as { model: string }).model : ""
  const provider = editorAiProviderForModel(model)
  let body: Record<string, unknown>
  try {
    body = editorAiRequestBody(parsed, provider)
  } catch (error) {
    return failure(400, error instanceof Error ? error.message : "Invalid request.")
  }
  if (!(await hasCredential(user.id, provider))) {
    return failure(403, `Add your ${EDITOR_AI_LABEL[provider]} key under API keys to use ${model}.`)
  }

  const url = editorAiUpstream(provider)
  assertAllowedProviderUrl(provider, url)
  try {
    const result = await withCredential({ userId: user.id, provider }, async (parts) => {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${parts.apiKey}`,
          ...(provider === "openai" ? { "OpenAI-Safety-Identifier": createHash("sha256").update(user.id).digest("hex") } : {}),
        },
        body: JSON.stringify(body),
      })
      // A provider's error body can echo the request's credentials; only the
      // status is passed on.
      if (!response.ok) return { status: response.status, json: null }
      return { status: 200, json: await response.json() as unknown }
    })
    if (!result) return failure(403, `Your ${EDITOR_AI_LABEL[provider]} key is not available right now. Check API keys.`)
    if (!result.json) return failure(result.status, `${EDITOR_AI_LABEL[provider]} returned HTTP ${result.status}. Check the key's quota and that it can use ${model}.`)
    return NextResponse.json(result.json)
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    console.error("[editor-ai] Upstream call failed:", timedOut ? "timeout" : error)
    return failure(timedOut ? 504 : 502, timedOut ? `${EDITOR_AI_LABEL[provider]} did not answer in time.` : `${EDITOR_AI_LABEL[provider]} could not be reached.`)
  }
}
