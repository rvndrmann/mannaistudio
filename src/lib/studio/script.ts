import { z } from "zod"

export interface ScriptScene {
  heading: string
  timing: string
  direction: string
  framing: string
  continuity: string
}

export interface ScriptContent {
  title: string
  overview: string
  body: string
  scenes: ScriptScene[]
}

export const scriptSceneSchema = z.object({
  heading: z.string().trim().default(""),
  timing: z.string().trim().default(""),
  direction: z.string().trim().default(""),
  framing: z.string().trim().default(""),
  continuity: z.string().trim().default(""),
}).passthrough()

export const scriptObjectSchema = z.object({
  title: z.string().trim().max(240).optional(),
  overview: z.string().trim().max(20_000).optional(),
  body: z.string().trim().max(100_000).optional(),
  scenes: z.array(scriptSceneSchema).max(200).optional(),
}).passthrough()

export const scriptContentSchema = z.union([
  z.string().trim(),
  scriptObjectSchema,
])

export const blankScript: ScriptContent = {
  title: "Untitled production",
  overview: "",
  body: "",
  scenes: [],
}

/**
 * Normalizes any script input into the canonical { title, overview, body, scenes }
 * shape that the Script tab and AI Director expect.
 *
 * It prevents data loss when models produce near-miss shapes (e.g. beats, tagline,
 * screenplay, synopsis, format, acts) by extracting title/overview and converting
 * all beat/action/dialogue content into a readable body.
 */
export function normalizeScriptContent(value: unknown): ScriptContent {
  if (value === null || value === undefined) {
    return { ...blankScript }
  }

  // Handle strings (raw text or JSON string)
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return { ...blankScript }

    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === "object") {
          return normalizeScriptContent(parsed)
        }
      } catch {
        // Not JSON, continue with text parsing
      }
    }

    const titleMatch = trimmed.match(/^(?:#\s*|Title\s*:\s*)([^\n]+)/im)
    const title = titleMatch?.[1]?.trim() || "Untitled production"

    let overview = ""
    const overviewMatch = trimmed.match(/(?:Overview|Synopsis|Logline|Concept|Premise)\s*:\s*([^\n]+(?:\n(?!(?:Scene|Shot|Beat|Script|Body|\d+:|#|\w+\s*:))(?!\s*$).+)*)/i)
    if (overviewMatch?.[1]) {
      overview = overviewMatch[1].trim()
    }

    return {
      title,
      overview,
      body: trimmed,
      scenes: [],
    }
  }

  // Handle arrays of scenes/beats
  if (Array.isArray(value)) {
    return normalizeScriptContent({ scenes: value })
  }

  // Handle objects
  if (typeof value === "object") {
    const raw = value as Record<string, unknown>

    const title = (
      (typeof raw.title === "string" && raw.title.trim()) ||
      (typeof raw.name === "string" && raw.name.trim()) ||
      (typeof raw.project_title === "string" && raw.project_title.trim()) ||
      (typeof raw.projectTitle === "string" && raw.projectTitle.trim()) ||
      (typeof raw.episode_title === "string" && raw.episode_title.trim()) ||
      (typeof raw.episodeTitle === "string" && raw.episodeTitle.trim()) ||
      (typeof raw.tagline === "string" && raw.tagline.trim()) ||
      "Untitled production"
    )

    const overviewParts: string[] = []
    const overviewCandidates = [
      raw.overview,
      raw.synopsis,
      raw.logline,
      raw.concept,
      raw.description,
      raw.premise,
      raw.summary,
    ]
    for (const cand of overviewCandidates) {
      if (typeof cand === "string" && cand.trim() && !overviewParts.includes(cand.trim())) {
        overviewParts.push(cand.trim())
      }
    }
    if (!overviewParts.length && typeof raw.tagline === "string" && raw.tagline.trim() && raw.tagline !== title) {
      overviewParts.push(raw.tagline.trim())
    }
    const overview = overviewParts.join("\n\n")

    // Normalize scenes if present
    const scenes: ScriptScene[] = []
    const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : []
    for (let i = 0; i < rawScenes.length; i++) {
      const s = rawScenes[i]
      if (typeof s === "string" && s.trim()) {
        scenes.push({
          heading: s.trim(),
          timing: "",
          direction: "",
          framing: "",
          continuity: "",
        })
      } else if (s && typeof s === "object") {
        const sObj = s as Record<string, unknown>
        scenes.push({
          heading: String(sObj.heading || sObj.scene || sObj.title || sObj.name || (sObj.scene_number ? `Scene ${sObj.scene_number}` : "") || `Scene ${i + 1}`).trim(),
          timing: String(sObj.timing || sObj.time || sObj.duration || sObj.timestamp || "").trim(),
          direction: String(sObj.direction || sObj.action || sObj.description || sObj.visual || "").trim(),
          framing: String(sObj.framing || sObj.camera || sObj.shot || "").trim(),
          continuity: String(sObj.continuity || sObj.notes || sObj.dialogue || "").trim(),
        })
      }
    }

    // Determine body text
    let body = ""
    if (typeof raw.body === "string" && raw.body.trim()) {
      body = raw.body.trim()
    } else if (typeof raw.screenplay === "string" && raw.screenplay.trim()) {
      body = raw.screenplay.trim()
    } else if (typeof raw.script === "string" && raw.script.trim()) {
      body = raw.script.trim()
    } else if (typeof raw.text === "string" && raw.text.trim()) {
      body = raw.text.trim()
    } else if (typeof raw.content === "string" && raw.content.trim()) {
      body = raw.content.trim()
    }

    // If body is still empty, synthesize from scenes or beats or other sections
    if (!body) {
      if (scenes.length > 0) {
        body = scenes
          .map((scene) =>
            [
              scene.heading,
              scene.timing ? `Timing: ${scene.timing}` : "",
              scene.framing ? `Framing: ${scene.framing}` : "",
              scene.direction ? `Action: ${scene.direction}` : "",
              scene.continuity ? `Notes: ${scene.continuity}` : "",
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n\n")
      } else if (Array.isArray(raw.beats) && raw.beats.length > 0) {
        body = raw.beats
          .map((b, i) => {
            if (typeof b === "string") return b.trim()
            if (b && typeof b === "object") {
              const bObj = b as Record<string, unknown>
              const time = String(bObj.time || bObj.timing || bObj.timestamp || bObj.duration || "").trim()
              const titlePart = String(bObj.title || bObj.name || bObj.shot || bObj.beat || `Beat ${i + 1}`).trim()
              const action = String(bObj.action || bObj.description || bObj.direction || bObj.visual || "").trim()
              const camera = String(bObj.camera || bObj.framing || "").trim()
              const dialogue = String(bObj.dialogue || bObj.audio || bObj.speech || bObj.sound || "").trim()

              const lines: string[] = []
              const header = [time ? `[${time}]` : "", titlePart].filter(Boolean).join(" ")
              if (header) lines.push(header)
              if (camera) lines.push(`Camera: ${camera}`)
              if (action) lines.push(action)
              if (dialogue) lines.push(`Dialogue: ${dialogue}`)
              return lines.join("\n")
            }
            return String(b)
          })
          .filter(Boolean)
          .join("\n\n")
      } else if (Array.isArray(raw.acts) && raw.acts.length > 0) {
        body = raw.acts
          .map((act, i) => {
            if (typeof act === "string") return act.trim()
            if (act && typeof act === "object") {
              const actObj = act as Record<string, unknown>
              const name = String(actObj.name || actObj.title || `Act ${i + 1}`).trim()
              const text = String(actObj.content || actObj.text || actObj.description || "").trim()
              return `${name}\n${text}`
            }
            return String(act)
          })
          .filter(Boolean)
          .join("\n\n")
      } else {
        // Fallback: format any remaining keys that have string or array values
        const ignoredKeys = new Set(["title", "name", "overview", "summary", "project_id", "episode_id", "episodeId", "projectId"])
        const remainingParts: string[] = []
        for (const [k, v] of Object.entries(raw)) {
          if (ignoredKeys.has(k) || v === null || v === undefined) continue
          if (typeof v === "string" && v.trim()) {
            remainingParts.push(`${k.toUpperCase().replace(/_/g, " ")}:\n${v.trim()}`)
          } else if (Array.isArray(v) && v.length > 0) {
            remainingParts.push(`${k.toUpperCase().replace(/_/g, " ")}:\n${v.map((item) => typeof item === "string" ? `- ${item}` : JSON.stringify(item)).join("\n")}`)
          } else if (typeof v === "object") {
            remainingParts.push(`${k.toUpperCase().replace(/_/g, " ")}:\n${JSON.stringify(v, null, 2)}`)
          }
        }
        body = remainingParts.join("\n\n")
      }
    }

    return {
      title,
      overview,
      body,
      scenes,
    }
  }

  return { ...blankScript }
}

export function parseScript(value: unknown): ScriptContent {
  return normalizeScriptContent(value)
}
