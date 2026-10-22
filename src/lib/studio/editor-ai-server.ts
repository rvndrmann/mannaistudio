import "server-only"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { hasByokSubscription, hasCredential } from "@/lib/byok/credential-service"
import { byokIsConfigured } from "@/lib/byok/kms"
import { BYOK_PAUSED_MESSAGE, byokPaused } from "@/lib/byok/paused"
import { EDITOR_AI_DEFAULT_MODEL, EDITOR_AI_LABEL, EDITOR_AI_PROVIDERS, type EditorAiProvider } from "./editor-ai"

export type EditorAiConnection =
  | { connected: true; provider: EditorAiProvider; label: string; model: string; models: string[] }
  | { connected: false; reason: string }

/**
 * The signed-in user behind the editor's request.
 *
 * The editor fetches with credentials omitted, so there is no cookie; it sends
 * the user's Supabase access token where an API key would go, and the token is
 * verified with Supabase like any session.
 */
export async function userFromBearer(request: Request) {
  const header = request.headers.get("authorization") || ""
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1]
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !url || !anon) return null
  const client = createSupabaseClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data.user
}

/** Which of the user's saved keys the editor's AI will run on, if any. */
export async function editorAiConnection(userId: string): Promise<EditorAiConnection> {
  if (await byokPaused()) return { connected: false, reason: BYOK_PAUSED_MESSAGE }
  if (!byokIsConfigured() || !(await hasByokSubscription(userId))) {
    return { connected: false, reason: "The editor's AI runs on your own API key. Subscribe to bring your own keys, then add an OpenAI or Gemini key under API keys." }
  }
  const held: EditorAiProvider[] = []
  for (const provider of EDITOR_AI_PROVIDERS) if (await hasCredential(userId, provider)) held.push(provider)
  if (!held.length) return { connected: false, reason: "Add an OpenAI or Gemini key under API keys to use the editor's AI." }
  const provider = held[0]
  return {
    connected: true,
    provider,
    label: EDITOR_AI_LABEL[provider],
    model: EDITOR_AI_DEFAULT_MODEL[provider],
    models: held.map((entry) => EDITOR_AI_DEFAULT_MODEL[entry]),
  }
}
