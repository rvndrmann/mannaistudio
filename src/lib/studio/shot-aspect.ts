import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Keeps a shot's prompt telling the truth about its framing.
 *
 * Prompts open by stating the aspect — "16:9 cinematic medium shot" — and the
 * shot carries the aspect as a setting as well. Change the project's aspect
 * mid-production and the setting moves while the sentence does not, so every
 * shot then carries two contradictory framings: the words say one thing and
 * `Required composition:` says another.
 *
 * The setting is the one the user chose, so the sentence is brought into line
 * with it — in the stored prompt rather than on the way past, because the
 * prompt you read in the workspace should be the prompt that runs.
 */

// Only ratios that are actually offered. A bare `\d+:\d+` would rewrite a
// timestamp, a score, or a line of dialogue that happens to contain a colon.
const KNOWN_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "2.39:1"]
const ASPECT_PATTERN = new RegExp(`(?<![\\w.:])(${KNOWN_ASPECTS.map((ratio) => ratio.replace(".", "\\.")).join("|")})(?![\\w:])`, "g")

export type AspectShot = { id: string; prompt?: string | null; aspect_ratio?: string | null }

/** The prompt with every stated aspect brought into line with the shot's own. */
export function restateAspect(prompt: string, aspect: string) {
  if (!KNOWN_ASPECTS.includes(aspect)) return prompt
  return prompt.replace(ASPECT_PATTERN, aspect)
}

export function aspectMismatch(shot: AspectShot) {
  const aspect = (shot.aspect_ratio || "").trim()
  const prompt = shot.prompt || ""
  if (!aspect || !prompt || !KNOWN_ASPECTS.includes(aspect)) return false
  const stated = Array.from(prompt.matchAll(ASPECT_PATTERN)).map((match) => match[1])
  return stated.some((ratio) => ratio !== aspect)
}

/**
 * Rewrites the shots whose prompt disagrees with their own aspect, and saves
 * them. Writes nothing when everything already agrees.
 */
export async function ensureShotAspects(supabase: SupabaseClient, shots: AspectShot[]) {
  const wrong = shots.filter(aspectMismatch)
  if (!wrong.length) return []
  await Promise.all(wrong.map(async (shot) => {
    const corrected = restateAspect(shot.prompt as string, shot.aspect_ratio as string)
    const { error } = await supabase.from("creator_shots").update({ prompt: corrected }).eq("id", shot.id)
    if (error) throw error
    // Kept in step so the response that found the drift already shows it fixed.
    shot.prompt = corrected
  }))
  return wrong.map((shot) => shot.id)
}
