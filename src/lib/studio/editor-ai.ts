/**
 * The Timeline editor's AI on the user's own provider key.
 *
 * OpenReel's AI Editor calls an OpenAI-style /chat/completions endpoint from
 * the browser. Pointed at /api/studio/editor-ai, that endpoint is ours: it
 * identifies the user from the session token the editor sends in place of an
 * API key, and forwards the request with the key saved in their BYOK vault.
 * The key never reaches the browser.
 *
 * Only providers with an OpenAI-compatible chat API qualify: OpenAI itself,
 * and Gemini through Google's OpenAI compatibility layer.
 */
import type { ByokProvider } from "@/lib/byok/providers"

export type EditorAiProvider = Extract<ByokProvider, "openai" | "gemini">

/** In order of preference when the user holds both keys. */
export const EDITOR_AI_PROVIDERS: EditorAiProvider[] = ["openai", "gemini"]

export const EDITOR_AI_DEFAULT_MODEL: Record<EditorAiProvider, string> = {
  openai: "gpt-5.6-luna",
  gemini: "gemini-3.7-flash",
}

export const EDITOR_AI_LABEL: Record<EditorAiProvider, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
}

// Fixed here, beside the provider; never taken from the request.
const UPSTREAM: Record<EditorAiProvider, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
}

export function editorAiUpstream(provider: EditorAiProvider) {
  return UPSTREAM[provider]
}

/** The provider a requested model belongs to. */
export function editorAiProviderForModel(model: string): EditorAiProvider {
  return /^(models\/)?gemini/i.test(model.trim()) ? "gemini" : "openai"
}

const MAX_OUTPUT_TOKENS = 8_192
const MAX_MESSAGES = 400

const PASSTHROUGH_KEYS = ["messages", "tools", "tool_choice", "parallel_tool_calls", "temperature", "top_p", "response_format", "stop"] as const

/**
 * The request as it will be forwarded: only the fields a chat-with-tools turn
 * uses, never streamed, with a bounded output budget. Throws on anything that
 * is not a chat request.
 */
export function editorAiRequestBody(body: unknown, provider: EditorAiProvider): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected a chat completion request.")
  const input = body as Record<string, unknown>
  const model = typeof input.model === "string" ? input.model.trim() : ""
  if (!model || model.length > 120) throw new Error("Choose a model.")
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > MAX_MESSAGES) {
    throw new Error("The request has no usable messages.")
  }
  const forwarded: Record<string, unknown> = { model, stream: false }
  for (const key of PASSTHROUGH_KEYS) if (input[key] !== undefined) forwarded[key] = input[key]
  const requested = Number(input.max_completion_tokens ?? input.max_tokens)
  const budget = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_OUTPUT_TOKENS) : MAX_OUTPUT_TOKENS
  // OpenAI's current models take only max_completion_tokens; Google's
  // compatibility layer documents max_tokens.
  forwarded[provider === "gemini" ? "max_tokens" : "max_completion_tokens"] = budget
  // OpenAI's gpt-5 models refuse function tools on /chat/completions at their
  // default reasoning effort (HTTP 400, param reasoning_effort); without it
  // the editor's AI cannot run at all on an OpenAI key.
  if (provider === "openai" && /^gpt-5/i.test(model) && Array.isArray(forwarded.tools) && forwarded.tools.length) {
    forwarded.reasoning_effort = "none"
  }
  return forwarded
}
