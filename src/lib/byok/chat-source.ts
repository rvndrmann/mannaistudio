import type { ByokProvider } from "./providers"

/**
 * Which provider serves a Director chat turn.
 *
 * The agent talks to OpenAI or Gemini through the same modules generation uses,
 * so it can run on a customer's connected key exactly as generation does — it
 * simply was never given the scope to do it in. Every chat turn therefore spent
 * the platform's budget, including for the customer paying their own way for
 * everything else, who is also the heaviest user of the chat.
 *
 * Matched on a prefix rather than an exact id so a model rename does not
 * silently send the turn back to the platform's account.
 */
export function chatModelProvider(model: string): ByokProvider | null {
  const id = (model || "").toLowerCase()
  if (id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3")) return "openai"
  if (id.startsWith("gemini")) return "gemini"
  return null
}
