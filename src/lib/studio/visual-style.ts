/**
 * The Visual styles that need more than a sentence of their own.
 *
 * Claymation is the first. It cannot be left to prompt words: on 2026-10-28 a
 * frame asked for "stop-motion claymation" with the clay puppet's sheet
 * attached, the project style was still photorealistic, and the studio's own
 * "strict live-action photorealism" block — which bans cartoons, 3D renders and
 * doll-like faces — won. The result was a photograph of a real man. So the style
 * is a setting, and when it is set the studio appends the claymation blocks in
 * place of the photographic ones, word for word as the founder wrote them
 * (instructions/style-claymation.md).
 *
 * Kept free of imports so entity-image-workflow, style-dna and the edge bundles
 * can all read it without a cycle.
 */

/** The stored value. The prompt line says "claymation" whatever spelling a caller stored. */
export const CLAYMATION_STYLE = "claymation"
export const CLAYMATION_STYLE_LABEL = "Claymation (stop-motion)"

/** The Visual styles Basic Settings offers, as they are stored. */
export const VISUAL_STYLE_OPTIONS = [
  "Realistic - 3D CG", "Anime - Japanese/Korean", "3D - Pixar Cartoon", "Realistic - Photorealistic",
  "3D - Chinese Style CG", "Anime - Chibi Cute", "Anime - Makoto Shinkai", "Anime - Ghibli", CLAYMATION_STYLE,
] as const

export const CLAYMATION_STYLE_LINE = "Required project style: claymation."

export const CLAYMATION_IMAGE_DIRECTIVE = "Stop-motion claymation: a handmade miniature set photographed on a tabletop with a real macro lens. Every character is a plasticine puppet: clay skin, sculpted clay hair in chunky strands or tufts, chunky clay hands with soft rounded fingers, oversized white googly eyes with small black pupils, simple sculpted brows and noses. Clothes, furniture, props and walls are sculpted plasticine or painted miniature materials, all matte, with visible fingerprints, sculpting-tool marks, soft rounded edges and small handmade unevenness. The googly eyes are the only glossy surface in the frame. Miniature-set lighting: a soft key with soft contact shadows, shallow depth of field, slight falloff toward the frame edges. Not a photograph of real people, not live action, not a smooth CGI or 3D render, not 2D animation, anime or illustration. No typography, labels, captions, UI or grid."

/**
 * A character sheet is a grid of views by design, so on a reference sheet the
 * block's "no grid" is relaxed — the same exception the photorealistic block
 * already makes for its "collage, grid".
 */
export const CLAYMATION_NO_GRID = "captions, UI or grid."
export const CLAYMATION_REFERENCE_GRID = "captions or UI."

export const CLAYMATION_IMAGE_TREATMENT = "Claymation treatment: Match the stated scene's light direction and colour. Keep the clay matte and the handmade marks visible at every framing, including close-ups of hands and faces, which stay puppet parts. Keep every character identical to its reference puppet: same sculpt, same clay colours, same clothes. Keep scale consistent with a twenty-centimeter puppet on a tabletop set. Explicit camera, lighting, reference and user choices take precedence over these defaults."

export const CLAYMATION_VIDEO_DIRECTIVE = "Stop-motion claymation animation: handmade plasticine puppets and props on a miniature tabletop set, shot frame by frame. Motion is stepped at 12 frames per second on twos, with slight frame-to-frame boiling of the clay surfaces, tiny jitter in hair and cloth edges, and a faint exposure flicker between frames. Camera moves advance in small visible steps, never a smooth glide. The clay stays matte; the googly eyes are the only glossy surface. Every character keeps its exact puppet sculpt, clay colours and clothes from its reference in every frame. Not live action, not smooth CGI or 3D animation, not 2D animation. No typography, captions or UI."

/**
 * Added to the Character & Asset, Storyboard and Video Prompt agents' briefs on
 * a claymation project, so the prompts the Director writes are clay prompts
 * before the style block is ever appended to them.
 */
export const CLAYMATION_AGENT_INSTRUCTIONS = "VISUAL STYLE: CLAYMATION. Write every prompt for stop-motion plasticine puppets on a miniature tabletop set. Every visible body part carries its material word (\"his chunky plasticine puppet hand\", \"the clay puppet head of @Matt\"); never a bare \"his hand\" or \"her face\". Do not use realism vocabulary: no pores, vellus hair, skin texture, film grain, handheld camera, autofocus hunting or crash zooms. For motion use stop-motion language: stepped 12 fps on twos, clay boiling between frames, exposure flicker, camera moves in small visible steps. The googly eyes are the only glossy surface; everything else is matte clay. Screens are blank glowing panels and no text is generated. Character sheets are plasticine puppet sheets on a mid-gray paper sweep, close-up, full front, full back."

export function isClaymationStyle(style: string | null | undefined): boolean {
  return /claymation|stop.?motion|plasticine/i.test(style || "")
}

/** The same test visualStyleDirective uses to choose its live-action block. */
export function isPhotorealStyle(style: string | null | undefined): boolean {
  return (style || "").trim().toLowerCase().includes("photoreal")
}

/** "Required project style: …" with claymation always spelled the one way. */
export function projectStyleLine(style: string): string {
  return isClaymationStyle(style) ? CLAYMATION_STYLE_LINE : `Required project style: ${style}.`
}

/**
 * Two stored spellings of one style compare equal: the UI writes "Realistic -
 * Photorealistic" and the database default is "photorealistic".
 */
export function sameVisualStyle(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (value: string | null | undefined) => isClaymationStyle(value) ? CLAYMATION_STYLE
    : isPhotorealStyle(value) ? "photoreal"
    : (value || "").trim().toLowerCase()
  return key(a) === key(b)
}

/** The short name a confirmation uses: "Apply Claymation to all 18 existing shots?" */
export function visualStyleName(style: string): string {
  if (isClaymationStyle(style)) return "Claymation"
  if (isPhotorealStyle(style)) return "Photorealistic"
  return style.trim() || "this style"
}

/**
 * The style a shot renders in. A shot follows its project unless someone set a
 * style on that shot on purpose; the `style` column alone is not that, because
 * every shot is created with the column's 'photorealistic' default whatever the
 * project says.
 */
export function resolveShotStyle(projectStyle: string, shot: { style?: unknown; metadata?: unknown } | null | undefined): string {
  const metadata = shot?.metadata && typeof shot.metadata === "object" ? shot.metadata as Record<string, unknown> : {}
  return metadata.style_override === true && typeof shot?.style === "string" && shot.style.trim() ? shot.style.trim() : projectStyle
}

const claymationWords = /\b(claymation|stop[\s-]?motion|plasticine|clay[\s-]?puppets?|googly[\s-]?eyes?)\b/i

/** Whether a brief, script, prompt or entity description asks for claymation. */
export function asksForClaymation(...texts: Array<string | null | undefined>): boolean {
  return texts.some((text) => typeof text === "string" && claymationWords.test(text))
}

export const STYLE_CONFLICT_CODE = "style_conflict"

// Not "the project style": a shot pinned to Photorealistic is held on a
// Claymation project too, and the user was told the project was the problem.
export const STYLE_CONFLICT_MESSAGE = "This prompt asks for claymation but it would render as Photorealistic. Switch the project and its shots to Claymation?"

/**
 * A generation held back because its words and the project style disagree.
 *
 * Sending it would have the photorealistic block overrule the prompt, which is
 * the 2026-10-28 failure exactly. The user picks: switch the project, or keep
 * photorealistic and send it anyway (`styleConflict: "keep"`).
 */
export class StyleConflictError extends Error {
  readonly status = 409
  readonly code = STYLE_CONFLICT_CODE
  readonly suggestedStyle = CLAYMATION_STYLE
  constructor() {
    super(STYLE_CONFLICT_MESSAGE)
    this.name = "StyleConflictError"
  }
}

/** Throws StyleConflictError when a photorealistic generation asks for clay. */
export function assertStyleMatchesPrompt(style: string, texts: Array<string | null | undefined>, styleConflict?: string | null) {
  if (styleConflict === "keep") return
  if (isPhotorealStyle(style) && asksForClaymation(...texts)) throw new StyleConflictError()
}

export function styleConflictBody(error: StyleConflictError) {
  return { error: error.message, code: error.code, suggestedStyle: error.suggestedStyle }
}
