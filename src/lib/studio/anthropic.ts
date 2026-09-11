import type Anthropic from "@anthropic-ai/sdk"
import type { OpenAIDirectorFunction, OpenAIDirectorToolCall } from "./openai"

export class AnthropicProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "AnthropicProviderError"
  }
}

export type ClaudeEffort = "low" | "high"

/**
 * Who serves a turn spoken in the Anthropic protocol, and how.
 *
 * DeepSeek publishes an Anthropic-compatible endpoint, so it is reached with
 * the same client and the same message conversion as Claude — only the host,
 * the key and the reasoning parameters differ. Those parameters are the reason
 * this is a record rather than a base URL: `thinking: adaptive` and
 * `output_config.effort` are Anthropic's own, and a compatibility layer that
 * does not implement them answers 400 rather than ignoring them.
 */
type ProtocolTarget = {
  /** The model id the provider itself knows, with any effort suffix removed. */
  model: string
  baseURL?: string
  apiKey: () => string
  /** Anthropic's adaptive thinking and effort dial, sent only where they exist. */
  anthropicReasoning: boolean
  effort: ClaudeEffort
}

function requireKey(name: string, provider: string): string {
  const key = process.env[name]
  if (!key) throw new AnthropicProviderError(`${provider} is not configured. Add ${name} to the server environment.`, 503)
  return key
}

/**
 * Splits a catalog id into the model the provider knows and the effort to run
 * it at.
 *
 * Effort is a per-request setting, but everything downstream of the picker —
 * the rate card, the credit charge, the session's model stamp, the admin's
 * pause switch — is keyed on one model id. Carrying the effort in the id keeps
 * all of that working per variant, and keeps a Low turn from being priced,
 * paused or recorded as if it were a High one.
 */
export function anthropicProtocolTarget(catalogId: string): ProtocolTarget | null {
  const id = (catalogId || "").toLowerCase()
  const effort: ClaudeEffort = id.endsWith("-low") ? "low" : "high"
  const stripped = id.endsWith("-low") ? id.slice(0, -"-low".length)
    : id.endsWith("-high") ? id.slice(0, -"-high".length)
    : id

  if (id.startsWith("claude-")) {
    return { model: stripped, apiKey: () => requireKey("ANTHROPIC_API_KEY", "Claude"), anthropicReasoning: true, effort }
  }
  if (id.startsWith("deepseek-")) {
    // Their own id, not the stripped one: `deepseek-v4-pro` ends in neither
    // suffix, but a future `-low` variant would strip correctly all the same.
    return {
      model: stripped,
      baseURL: "https://api.deepseek.com/anthropic",
      apiKey: () => requireKey("DEEPSEEK_API_KEY", "DeepSeek"),
      anthropicReasoning: false,
      effort,
    }
  }
  return null
}

export function isAnthropicProtocolModel(value: unknown): boolean {
  return typeof value === "string" && anthropicProtocolTarget(value) !== null
}

const DATA_URL = /^data:([^;,]+);base64,(.+)$/i

/** Maps a Responses-API user turn onto Claude content blocks. */
function userContentBlocks(content: unknown): Anthropic.ContentBlockParam[] {
  if (!Array.isArray(content)) return [{ type: "text", text: String(content || "") }]
  const blocks: Anthropic.ContentBlockParam[] = []
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue
    const part = entry as Record<string, unknown>
    if (part.type === "input_text" || part.type === "text") {
      const text = String(part.text || "")
      if (text) blocks.push({ type: "text", text })
      continue
    }
    if (part.type === "input_image") {
      const url = String(part.image_url || "")
      const inlined = DATA_URL.exec(url)
      if (inlined) {
        blocks.push({ type: "image", source: { type: "base64", media_type: inlined[1] as "image/png", data: inlined[2] } })
      } else if (url.startsWith("https://")) {
        blocks.push({ type: "image", source: { type: "url", url } })
      }
    }
  }
  return blocks.length ? blocks : [{ type: "text", text: "" }]
}

function toolResultContent(output: unknown): string {
  if (typeof output === "string") return output
  try {
    return JSON.stringify(output ?? {})
  } catch {
    return String(output)
  }
}

function parsedArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(value || "{}"))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { result: parsed }
  } catch {
    return {}
  }
}

/**
 * The thinking block a tool call was reasoned in, carried on the call itself.
 *
 * Claude requires the thinking that led to a tool call to come back unchanged
 * with the tool's result, or it rejects the continuation. The Director's item
 * list has one field for exactly this shape of provider state — Gemini's thought
 * signature — so the block rides along in it rather than in a second mechanism
 * that only one provider would ever read.
 */
function readCarriedThinking(item: Record<string, unknown>): Anthropic.ThinkingBlockParam | null {
  const raw = item.thoughtSignature
  if (typeof raw !== "string" || !raw.startsWith("{")) return null
  try {
    const parsed = JSON.parse(raw) as Anthropic.ThinkingBlockParam
    return parsed?.type === "thinking" && parsed.signature ? parsed : null
  } catch {
    return null
  }
}

export async function createAnthropicDirectorToolTurn(input: {
  userId: string
  model: string
  instructions: string
  items: Array<Record<string, unknown>>
  tools: OpenAIDirectorFunction[]
}): Promise<{
  id: string
  content: string
  calls: OpenAIDirectorToolCall[]
  usage: Record<string, unknown>
}> {
  const target = anthropicProtocolTarget(input.model)
  if (!target) throw new AnthropicProviderError(`${input.model} does not speak the Anthropic protocol.`, 400)

  // Loaded only when a Claude turn actually runs. The Director's turn is
  // bundled into a Deno Edge Function, and a top-level import of a provider SDK
  // is fetched when the function boots — so an SDK that failed to resolve there
  // would take every other model down with it, including the ones that have
  // nothing to do with Claude.
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk")
  const client = new AnthropicClient({ apiKey: target.apiKey(), ...(target.baseURL ? { baseURL: target.baseURL } : {}) })
  const messages: Anthropic.MessageParam[] = []

  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index]

    if (item.type === "function_call" || item.type === "function_call_output") {
      // One assistant message holding every call of a batch, then one user
      // message holding all of their results — the shape the API requires. A
      // call that follows a result starts the next sequential step, which is
      // what closes this batch.
      const calls: Array<Record<string, unknown>> = []
      const outputs: Array<Record<string, unknown>> = []
      let end = index
      while (end < input.items.length) {
        const entry = input.items[end]
        if (entry.type === "function_call") {
          if (outputs.length) break
          calls.push(entry)
        } else if (entry.type === "function_call_output") {
          outputs.push(entry)
        } else {
          break
        }
        end += 1
      }
      index = end - 1

      if (calls.length) {
        const thinking = readCarriedThinking(calls[0])
        messages.push({
          role: "assistant",
          content: [
            ...(thinking ? [thinking] : []),
            ...calls.map((entry): Anthropic.ToolUseBlockParam => ({
              type: "tool_use",
              id: String(entry.call_id),
              name: String(entry.name),
              input: parsedArguments(entry.arguments),
            })),
          ],
        })
      }
      if (outputs.length) {
        messages.push({
          role: "user",
          content: outputs.map((entry): Anthropic.ToolResultBlockParam => ({
            type: "tool_result",
            tool_use_id: String(entry.call_id),
            content: toolResultContent(entry.output),
          })),
        })
      }
      continue
    }

    if (item.role === "assistant") {
      const text = String(item.content || "")
      messages.push({ role: "assistant", content: text || "..." })
      continue
    }
    messages.push({ role: "user", content: userContentBlocks(item.content) })
  }

  // The conversation must open with a user turn, and a history page can begin
  // on an assistant reply from an earlier turn.
  if (!messages.length || messages[0].role !== "user") {
    messages.unshift({ role: "user", content: "Continue." })
  }

  try {
    const response = await client.messages.create({
      model: target.model,
      max_tokens: 16000,
      system: input.instructions,
      messages,
      ...(target.anthropicReasoning ? { thinking: { type: "adaptive" as const }, output_config: { effort: target.effort } } : {}),
      tools: input.tools.map((tool): Anthropic.Tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
      })),
    })

    let content = ""
    let thinking: Anthropic.ThinkingBlockParam | null = null
    const calls: OpenAIDirectorToolCall[] = []

    for (const block of response.content) {
      if (block.type === "text") {
        content += (content ? "\n" : "") + block.text
      } else if (block.type === "thinking" && block.signature) {
        // Only the first is kept: it is replayed on the assistant message that
        // carries this batch's calls, and that message takes one.
        thinking = thinking || { type: "thinking", thinking: block.thinking, signature: block.signature }
      } else if (block.type === "tool_use") {
        calls.push({
          callId: block.id,
          name: block.name,
          arguments: block.input,
          // Attached to the first call only, matching where it is read back.
          thoughtSignature: calls.length === 0 && thinking ? JSON.stringify(thinking) : undefined,
        })
      }
    }

    return {
      id: response.id,
      content: content.trim(),
      calls,
      usage: {
        input_tokens: response.usage.input_tokens || 0,
        output_tokens: response.usage.output_tokens || 0,
        total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
      },
    }
  } catch (error) {
    if (error instanceof AnthropicProviderError) throw error
    const message = error instanceof Error ? error.message : "Claude chat failed"
    throw new AnthropicProviderError(`Claude request failed: ${message}`)
  }
}
