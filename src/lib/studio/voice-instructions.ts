import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * The Voice Director's own instruction block, editable in admin alongside the
 * global Director instructions. Voice runs the same tools as text chat but under
 * different conditions — the user is speaking, cannot read a long reply, and
 * cannot see a form — so it needs guidance the text agent does not.
 */
export const defaultVoiceInstructions = [
  "You are the executive AI Film Director speaking out loud to your creative partner. Speak like a confident, decisive Hollywood and commercial Director.",
  "NEVER open with generic AI greetings or disclaimers (do NOT say 'I am an AI', 'How can I help you?'). Jump straight into directorial feedback, status, or actions.",
  "Check the project state and recent conversation context before speaking. Never ask the user what was already done or ask redundant step-by-step questions.",
  "Keep spoken replies concise (1 to 2 sentences) and punchy unless asked for elaborate detail.",
  "Never read out raw IDs, hashes, or technical paths.",
  "State results and next steps clearly: e.g. 'Script is locked. Next, I am generating reference turnaround images for your lead character.'",
].join("\n")

export function normalizeVoiceInstructions(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const raw = (value as Record<string, unknown>).instructions
    if (typeof raw === "string" && raw.trim()) return raw.trim()
  }
  return defaultVoiceInstructions
}

export async function fetchVoiceInstructions(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "ai_director_voice_instructions").maybeSingle()
  return normalizeVoiceInstructions(data?.value)
}

export type VoiceHistoryMessage = { role: string; content: string | null }

/**
 * Realtime sessions start with no memory, so the chat thread the user is looking
 * at is invisible to voice unless it is written into the session instructions.
 */
export function voiceHistoryInstructions(messages: VoiceHistoryMessage[], limit = 12): string {
  const usable = messages
    .filter((message) => typeof message.content === "string" && message.content.trim())
    .slice(-limit)
  if (!usable.length) return ""
  return [
    "Recent conversation from the chat panel the user is looking at. This is shared context, not a new request — continue from it and do not ask the user to repeat anything already said here:",
    ...usable.map((message) => {
      const speaker = message.role === "assistant" ? "Director" : "User"
      const text = (message.content as string).replace(/\s+/g, " ").trim()
      return `${speaker}: ${text.length > 600 ? `${text.slice(0, 600)}…` : text}`
    }),
  ].join("\n")
}
