import Anthropic from "@anthropic-ai/sdk"
import type { OpenAIDirectorFunction, OpenAIDirectorToolCall } from "./openai"

export class AnthropicProviderError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message)
    this.name = "AnthropicProviderError"
  }
}

function getAnthropicApiKey() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new AnthropicProviderError("Claude is not configured. Add ANTHROPIC_API_KEY to the server environment.", 503)
  return key
}

export type ClaudeEffort = "low" | "high"

/**
 * Splits a catalog id into the model Anthropic knows and the effort to run it at.
 *
 * Effort is a per-request setting, but everything downstream of the picker —
 * the rate card, the credit charge, the session's model stamp, the admin's
 * pause switch — is keyed on one model id. Carrying the effort in the id keeps
 * all of that working per variant, and keeps a Low turn from being priced,
 * paused or recorded as if it were a High one.
 */
export function claudeDirectorModel(catalogId: string): { model: string; effort: ClaudeEffort } | null {
  const id = (catalogId || "").toLowerCase()
  if (!id.startsWith("claude-")) return null
  if (id.endsWith("-low")) return { model: id.slice(0, -"-low".length), effort: "low" }
  if (id.endsWith("-high")) return { model: id.slice(0, -"-high".length), effort: "high" }
  return { model: id, effort: "high" }
}

export function isClaudeDirectorModel(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().startsWith("claude-")
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
  const target = claudeDirectorModel(input.model)
  if (!target) throw new AnthropicProviderError(`${input.model} is not a Claude model.`, 400)

  const client = new Anthropic({ apiKey: getAnthropicApiKey() })
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
      thinking: { type: "adaptive" },
      output_config: { effort: target.effort },
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
