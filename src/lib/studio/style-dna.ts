/**
 * The look a project copies from reference images.
 *
 * A mood board is only useful to an image model if someone reads it out loud.
 * Style DNA is that reading, done once by a vision model against the uploaded
 * references and then stored: palette, light, texture, composition, and mood as
 * structured fields rather than prose, so the panel can show it, the user can
 * correct the one field that is wrong, and each block can take the subset of it
 * that its own job allows.
 *
 * It rides the same lifecycle as the camera package in ./camera-settings:
 * project default → per-block subset → snapshotted onto the generation job, so
 * changing the look later leaves frames already shot exactly as they were.
 */

import { z } from "zod"
import { visualStyleDirective } from "./entity-image-workflow"

const list = (max: number) => z.array(z.string().trim().max(160)).max(max).default([]).catch([])
const line = z.string().trim().max(400).default("").catch("")

/**
 * Every section's empty value, spelled out rather than left as `{}`.
 *
 * A zod default is handed back as written and never run through the schema, so
 * `{}` would reach the reader as a section with no keys at all and every
 * consumer would have to guard each field. Naming the empty shape once lets both
 * the missing case (`.default`) and the wrong-type case (`.catch`) land on it.
 */
const EMPTY = {
  // Built fresh on every call rather than shared: a default is handed back
  // as-is, so one shared array would be the same array in every parsed look.
  feeling: () => ({ coreEmotions: [] as string[], mood: "", atmosphere: [] as string[] }),
  influences: () => ({ art: "", film: "", design: "", cultural: "" }),
  color: () => ({ dominant: [] as string[], accent: [] as string[], tone: "" }),
  lighting: () => ({ type: "", sourceDirection: "", key: "", atmospherics: [] as string[] }),
  composition: () => ({ layout: "", perspective: "", depthOfField: "", framing: "" }),
  texture: () => ({ textures: [] as string[], materials: [] as string[] }),
  scale: () => ({ senseOfScale: "", viewerRelationship: "" }),
  subject: () => ({ realism: "", overarchingStyle: "", criticalDetails: [] as string[] }),
}

/**
 * Every field is optional with a default. A vision model that returns eight of
 * nine sections should give the user eight usable sections, not a parse error
 * and an empty panel.
 */
export const styleDnaSchema = z.object({
  version: z.literal(1).default(1).catch(1),
  summary: line,
  feeling: z.object({ coreEmotions: list(6), mood: line, atmosphere: list(8) }).default(EMPTY.feeling).catch(EMPTY.feeling),
  influences: z.object({ art: line, film: line, design: line, cultural: line }).default(EMPTY.influences).catch(EMPTY.influences),
  color: z.object({ dominant: list(6), accent: list(4), tone: line }).default(EMPTY.color).catch(EMPTY.color),
  lighting: z.object({ type: line, sourceDirection: line, key: line, atmospherics: list(6) }).default(EMPTY.lighting).catch(EMPTY.lighting),
  composition: z.object({ layout: line, perspective: line, depthOfField: line, framing: line }).default(EMPTY.composition).catch(EMPTY.composition),
  texture: z.object({ textures: list(8), materials: list(6) }).default(EMPTY.texture).catch(EMPTY.texture),
  scale: z.object({ senseOfScale: line, viewerRelationship: line }).default(EMPTY.scale).catch(EMPTY.scale),
  subject: z.object({ realism: line, overarchingStyle: line, criticalDetails: list(8) }).default(EMPTY.subject).catch(EMPTY.subject),
  negatives: list(10),
  /**
   * Whether the reference outranks the project's Visual Style setting.
   *
   * Off by default and deliberately so: the photoreal branch of
   * visualStyleDirective hard-negates illustration and painting, so a painterly
   * board dropped into a photoreal project would otherwise put two contradictory
   * instructions in the same prompt. Off means the project still owns medium and
   * realism and the DNA owns palette, light, texture, and mood. On means the
   * user has said the reference is the medium, and the project clause steps out.
   */
  overrideProjectStyle: z.boolean().default(false).catch(false),
  /** Storage paths of the images this was read from, for the panel and re-runs. */
  sourceImages: z.array(z.string().max(2_000)).max(6).default([]).catch([]),
  extractedAt: z.string().max(40).default("").catch(""),
})

export type StyleDna = z.infer<typeof styleDnaSchema>

/**
 * Which block is asking. Each one can absorb a different amount of the look
 * before the image stops doing its job.
 */
export type StyleBlock = "character" | "asset" | "scene" | "shot"

export function styleBlockForEntityType(type: string | null | undefined): StyleBlock {
  if (type === "character") return "character"
  if (type === "scene") return "scene"
  return "asset"
}

/**
 * What each block is allowed to inherit.
 *
 * A character reference sheet is an identity lock: buildEntityReferenceImagePrompt
 * asks for a neutral backdrop, even lighting, and a relaxed reference pose on
 * purpose. Pour a moody DNA's lighting, composition, and scale into it and the
 * turnaround stops being usable as a reference. So a character takes only the
 * things that survive a neutral setup — palette, materials, medium.
 *
 * A scene plate is a real place, so it takes the light and the air too, but not
 * composition or scale: the plate is fixed at eye level and neutral so shots can
 * be staged anywhere in its depth later.
 *
 * A storyboard shot is the finished frame and takes everything.
 */
const BLOCK_SECTIONS: Record<StyleBlock, ReadonlyArray<keyof StyleDna>> = {
  character: ["color", "texture", "subject"],
  asset: ["color", "texture", "subject"],
  scene: ["feeling", "color", "lighting", "texture", "subject", "influences"],
  shot: ["feeling", "influences", "color", "lighting", "composition", "texture", "scale", "subject"],
}

function joined(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).join(", ")
}

function sectionLines(dna: StyleDna, section: keyof StyleDna): string[] {
  switch (section) {
    case "feeling": {
      const parts = [dna.feeling.mood, joined(dna.feeling.coreEmotions), joined(dna.feeling.atmosphere)].filter(Boolean)
      return parts.length ? [`Mood: ${parts.join("; ")}.`] : []
    }
    case "influences": {
      const parts = [dna.influences.art, dna.influences.film, dna.influences.design, dna.influences.cultural].filter(Boolean)
      return parts.length ? [`Visual lineage: ${parts.join("; ")}.`] : []
    }
    case "color": {
      const parts = [
        dna.color.dominant.length ? `dominant ${joined(dna.color.dominant)}` : "",
        dna.color.accent.length ? `accents of ${joined(dna.color.accent)}` : "",
        dna.color.tone,
      ].filter(Boolean)
      return parts.length ? [`Color: ${parts.join("; ")}.`] : []
    }
    case "lighting": {
      const parts = [dna.lighting.type, dna.lighting.sourceDirection, dna.lighting.key, joined(dna.lighting.atmospherics)].filter(Boolean)
      return parts.length ? [`Lighting: ${parts.join("; ")}.`] : []
    }
    case "composition": {
      const parts = [dna.composition.layout, dna.composition.perspective, dna.composition.depthOfField, dna.composition.framing].filter(Boolean)
      return parts.length ? [`Composition: ${parts.join("; ")}.`] : []
    }
    case "texture": {
      const parts = [joined(dna.texture.textures), dna.texture.materials.length ? `materials: ${joined(dna.texture.materials)}` : ""].filter(Boolean)
      return parts.length ? [`Texture and surface: ${parts.join("; ")}.`] : []
    }
    case "scale": {
      const parts = [dna.scale.senseOfScale, dna.scale.viewerRelationship].filter(Boolean)
      return parts.length ? [`Scale: ${parts.join("; ")}.`] : []
    }
    case "subject": {
      // Realism is the one field the project's Visual Style also speaks to, so
      // it is only emitted when the reference has been given the last word.
      const parts = [dna.overrideProjectStyle ? dna.subject.realism : "", dna.subject.overarchingStyle, joined(dna.subject.criticalDetails)].filter(Boolean)
      return parts.length ? [`Rendering: ${parts.join("; ")}.`] : []
    }
    default:
      return []
  }
}

/** True when nothing was ever extracted, or everything the user kept is blank. */
export function isEmptyStyleDna(dna: StyleDna | null | undefined): boolean {
  if (!dna) return true
  return BLOCK_SECTIONS.shot.every((section) => sectionLines(dna, section).length === 0) && dna.negatives.length === 0
}

/**
 * The look as one prompt block, or "" when there is nothing to say.
 *
 * Never composed into a value that is written back into a prompt field: like the
 * camera clause, feeding a composed prompt back in stacks another look block on
 * every regeneration until the prompt is noise.
 */
export function styleDnaDirective(dna: StyleDna | null | undefined, block: StyleBlock): string {
  if (!dna || isEmptyStyleDna(dna)) return ""
  const lines = BLOCK_SECTIONS[block].flatMap((section) => sectionLines(dna, section))
  if (dna.negatives.length) lines.push(`Avoid: ${joined(dna.negatives)}.`)
  if (!lines.length) return ""
  const heading = block === "character" || block === "asset"
    ? "Match the project's reference look in palette, materials, and finish only — keep the neutral backdrop, even lighting, and reference framing this image calls for."
    : "Match the project's reference look exactly."
  return [heading, ...lines].join("\n")
}

/**
 * The lines that describe the look, in the order they belong in a prompt.
 *
 * Every image and video route composes the same two clauses — the project style
 * and its directive — so the DNA is spliced in here rather than at six separate
 * call sites, and the precedence rule lives in one place.
 */
export function composeLookDirectives(style: string, dna: StyleDna | null | undefined, block: StyleBlock): string[] {
  const look = styleDnaDirective(dna, block)
  if (dna && !isEmptyStyleDna(dna) && dna.overrideProjectStyle) {
    // The reference is the medium. Emitting the project's style clause here
    // would contradict the DNA in the same prompt rather than refine it.
    return [look].filter(Boolean)
  }
  return [`Required project style: ${style}.`, visualStyleDirective(style), look].filter(Boolean)
}

/**
 * The clause that keeps a look reference from being read as a subject reference.
 *
 * Providers get one flat list of reference images and treat all of them as
 * things to reproduce, so a mood board sent beside a character sheet donates its
 * people, poses, and props to the frame. Naming the trailing images and what
 * they are for is what separates the two.
 */
export function styleReferenceClause(count: number): string {
  if (count < 1) return ""
  const which = count === 1 ? "The final reference image is" : `The final ${count} reference images are`
  return `${which} a look reference only: copy the palette, color grade, lighting quality, texture, and finish. Do not copy the subject, people, pose, wardrobe, objects, or framing from ${count === 1 ? "it" : "them"}.`
}

/** The project's stored look, or null when nobody has extracted one. */
export function projectStyleDna(project: Record<string, unknown> | null | undefined): StyleDna | null {
  const metadata = project?.metadata && typeof project.metadata === "object" ? project.metadata as Record<string, unknown> : {}
  const basicSettings = metadata.basic_settings && typeof metadata.basic_settings === "object" ? metadata.basic_settings as Record<string, unknown> : {}
  const stored = basicSettings.styleDna
  if (!stored || typeof stored !== "object") return null
  const parsed = styleDnaSchema.safeParse(stored)
  if (!parsed.success) return null
  return isEmptyStyleDna(parsed.data) ? null : parsed.data
}

/** The project's look reference images, capped so they cannot crowd out the cast. */
export const MAX_STYLE_REFERENCE_IMAGES = 2

/** The pixels that go to the provider alongside a look, from whichever look won. */
export function styleReferenceImagesOf(dna: StyleDna | null | undefined): string[] {
  if (!dna) return []
  return dna.sourceImages.filter((path) => typeof path === "string" && path.trim()).slice(0, MAX_STYLE_REFERENCE_IMAGES)
}

export function projectStyleReferenceImages(project: Record<string, unknown> | null | undefined): string[] {
  return styleReferenceImagesOf(projectStyleDna(project))
}

/**
 * Reads a look that came out of the database or off the wire, where the shape
 * may have moved underneath it. Anything unusable falls back to the project's
 * look rather than being passed through to the prompt half-formed.
 */
export function normalizeStyleDna(value: unknown): StyleDna | null {
  if (!value || typeof value !== "object") return null
  const parsed = styleDnaSchema.safeParse(value)
  if (!parsed.success) return null
  return isEmptyStyleDna(parsed.data) ? null : parsed.data
}

/**
 * project look → this one image's override → the look the prompt is built from.
 *
 * Mirrors resolveCameraSettings, and for the same reason: a library whose
 * references were each shot under a different look is worth less than one whose
 * references match, so the project's look is the floor and lifting it is a
 * deliberate, per-image act.
 *
 * `null` as an override is meaningful and distinct from `undefined`: it is how
 * "this image deliberately has no look" is expressed, and it must not silently
 * inherit the project's.
 */
export function resolveStyleDna({
  override,
  projectDefault,
}: {
  override?: unknown
  projectDefault?: StyleDna | null
}): StyleDna | null {
  if (override === undefined) return projectDefault ?? null
  if (override === null) return null
  return normalizeStyleDna(override) ?? projectDefault ?? null
}

/**
 * The worksheet, addressed to a vision model and pointed at JSON.
 *
 * The instruction to extract essence rather than name-drop is load-bearing: a
 * model asked what a picture looks like will happily answer "like Blade Runner",
 * which tells an image model nothing it can render.
 */
export const STYLE_DNA_INSTRUCTIONS = `You are a Strategic AI Creative Director. You are given one or more reference images and must define a single clear visual intent that another image model can reproduce.

Analyse every image together and describe the look they share. Work through all of the following, and be concrete — describe what is actually visible rather than naming a film, artist, or brand and stopping there. Where an influence is obvious, state the visual quality it contributes, not just its name.

1. Feeling — core emotions, overall mood or vibe, and atmosphere keywords.
2. Influences — art or photography style, film or cinematography, design or architecture, cultural or historical era. Extract the essence, never a bare name.
3. Colour — dominant colours, accent colours, and overall tone (warm, cool, muted, vibrant, monochromatic, high contrast).
4. Lighting — hard or soft, source and direction, high-key or low-key, and atmospheric effects such as haze, volumetric shafts, or dust.
5. Composition — layout, perspective and camera angle, depth of field, and how the frame guides the eye.
6. Texture and materiality — dominant surface qualities and the specific materials that define the look.
7. Scale — grand or intimate, and the viewer's relationship to the subject.
8. Subject rendering — level of realism, overarching style, and the crucial details that make the look what it is.
9. Negatives — the things that would break this look if they appeared.

Rules:
- Use short, renderable phrases. "low-key amber key light from a single window, deep falloff" is useful; "moody" alone is not.
- Describe the LOOK, never the subject matter. Do not mention the specific people, characters, products, or objects in the images — those belong to the reference, not to the style.
- Leave a field as an empty string or empty array if the images genuinely do not establish it. Do not invent.
- Write "summary" as one sentence a person could read at a glance.

Respond with JSON only, matching exactly this shape:
{
  "summary": string,
  "feeling": { "coreEmotions": string[], "mood": string, "atmosphere": string[] },
  "influences": { "art": string, "film": string, "design": string, "cultural": string },
  "color": { "dominant": string[], "accent": string[], "tone": string },
  "lighting": { "type": string, "sourceDirection": string, "key": string, "atmospherics": string[] },
  "composition": { "layout": string, "perspective": string, "depthOfField": string, "framing": string },
  "texture": { "textures": string[], "materials": string[] },
  "scale": { "senseOfScale": string, "viewerRelationship": string },
  "subject": { "realism": string, "overarchingStyle": string, "criticalDetails": string[] },
  "negatives": string[]
}`
