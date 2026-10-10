import { applyCameraSettings, type CameraSettings } from "./camera-settings"
import { composeLookDirectives, type StyleDna, type StyleBlock } from "./style-dna"

/** Supplemental rules override house defaults, never the user's explicit direction. */
export const IMAGE_REALISM_AUTHORING_INSTRUCTIONS = `PHOTOGRAPHIC IMAGE AUTHORING — applies only to photographic image requests.
Preserve the approved subject, identity, wardrobe, product geometry, exact packaging text, brand colours, references, project style, model, ratio, resolution, Style DNA and explicit camera choices. Reference identity wins over invented appearance. Do not apply this layer to animation, illustration or other intentionally stylized work.
Write a compact photographic brief with only visible, relevant details: camera height and approximate subject distance, framing and plausible lens perspective; motivated light source, direction, colour temperature and softness; exposure and shadows appropriate to that source; believable anatomy, weight and surface contact; visible natural skin/hair or material texture; fabric tension and folds where visible; environmental depth and contextual wear; restrained processing and optical depth. Do not invent exact exposure numbers, clothing, facial traits, products, props or light sources. Use a suitable depth of field rather than defaulting to f/1.4. UGC should have plausible consumer-camera perspective, sports should have believable motion and lighting, and product close-ups should keep the required packaging in focus.
Time and stated conditions control light: an outdoor scene explicitly before sunrise/in darkness has no sun or sunrise glow. A 04:30 AM pre-dawn stadium uses directional floodlights against dark surroundings, preserving shadow detail and lamp highlights. Daylight, interior and studio light must follow the scene or approved reference, not a universal golden-hour preset. Do not infer sunrise from clock time alone.
Sports/exertion may show physically appropriate sweat and local highlights; earlier blanket matte/no-sweat rules must not prohibit that. Keep ordinary skin texture without an all-over artificial gloss. Character reference sheets may use their requested grid; normal shots are single frames. Required packaging text is permitted, while unrelated captions/overlays remain prohibited unless requested. Avoid generic 8K/ultra-detailed/HDR tags and scene-contradicting universal negatives. Put necessary negatives in the supported prompt text; do not invent a separate API field. Respect per-model limits and reference capabilities; report a concrete incompatibility rather than truncating locks or switching models.`

export type ImagePromptOptions = {
  prompt: string
  aspectRatio?: string
  style?: string
  styleDna?: StyleDna | null
  block?: StyleBlock
  entityContext?: string
  camera?: CameraSettings | null
  drawEdit?: boolean
}

const LAYER_START = "Photographic treatment: "
const LAYER_END = " Explicit camera, lighting, reference and user choices take precedence over these defaults."

function explicitStylizedDirection(prompt: string): boolean {
  return /\b(?:anime|cartoon|illustrated|animated|watercolou?r|oil painting)\s+(?:style|look|scene|portrait|image|landscape|painting)\b/i.test(prompt)
}

export function isPhotographicRequest(prompt: string, style?: string, dna?: StyleDna | null): boolean {
  const medium = dna?.overrideProjectStyle
    ? `${dna.subject.realism} ${dna.subject.overarchingStyle}`
    : style || ""
  const stylized = /\b(anime|animation|animated|cartoon|illustration|painting|pixar|ghibli|chibi|3d|CG)\b/i
  if (medium && stylized.test(medium)) return false
  // Explicit style in the user's request can intentionally depart from the project default.
  if (explicitStylizedDirection(prompt)) return false
  return /photoreal|live.action|photograph|\bphoto\b|\brealistic\b/i.test(medium || prompt)
}

function photographicTreatment(base: string, options: ImagePromptOptions): string {
  const text = base.toLowerCase()
  const characterSheet = options.block === "character" || /character reference sheet|multi.view turnaround/.test(text)
  const product = options.block === "asset" || /product|packaging|bottle|jar|still.life/.test(text)
  const sports = /football|athlet|sports|training|workout|running|sprint|exertion/.test(text)
  const ugc = /\bugc\b|selfie|testimonial|consumer.camera/.test(text)
  const wide = /\bwide\b|establishing|landscape|stadium|environmental/.test(text) && !characterSheet && !product
  const human = characterSheet || sports || ugc || /\b(person|woman|man|human|portrait|fashion|model|character|skin|face)\b/.test(text)
  const dark = /before sunrise|pre.?dawn|\bnight\b|in darkness|dark sky/.test(text)
    || (/\b0?4[:.]30\s*(?:am|a\.m\.)?\b/i.test(base) && /floodlight|stadium/.test(text))
  const explicitOptics = options.camera || /\b\d{1,3}\s*mm\b|\bf\/\d|lens|camera height|subject distance|shot on/.test(text)
  const sentences: string[] = []
  if (!explicitOptics) {
    sentences.push(characterSheet
      ? "Use neutral reference framing at a practical portrait distance, with consistent perspective and sufficient focus across the requested views."
      : product
      ? "Use a practical product-camera distance and perspective without exaggerated distortion, keeping required surface and label detail within the focus plane."
      : ugc
      ? "Use a believable eye-level consumer camera about an arm's length to a metre away, natural face perspective and readable room depth, without studio-glamour processing."
      : sports
      ? "For a medium or wide sports frame, place the camera roughly 3–15 metres away at a plausible crouched or standing sideline height; move closer only when the requested framing needs it; preserve natural limb perspective, readable motion and sufficient depth of field."
      : wide
      ? "Use a plausible standing-height viewpoint several metres from the subject, with wide environmental perspective and enough depth of field to read the setting."
      : "For a human portrait, use an approximately eye-level viewpoint about 1–3 metres away unless the requested framing specifies otherwise; for other subjects, match camera height and distance to their scale. Maintain natural perspective and optical depth without exaggerated background blur.")
  }
  if (dark) {
    sentences.push(/floodlight/.test(text)
      ? "The outdoor pre-dawn or night setting has a blue-black sky and naturally dark surroundings, with no sunlight or glowing sunrise horizon; directional stadium floodlights supply the light. Keep artificial-light colour consistent with those lamps, exposure that retains skin detail and bright-lamp highlights, and shadows falling away from the actual light sources."
      : "Keep the stated dark setting dark; expose for the specified practical sources with credible colour, falloff and shadows, without adding daylight or a sunrise glow.")
  } else if (characterSheet) {
    sentences.push("Maintain the neutral backdrop and soft, even reference lighting, with consistent exposure and colour across views rather than dramatic scene lighting.")
  } else if (/daytime|daylight|noon|sunlit/.test(text)) {
    sentences.push("Follow the stated daylight direction, colour and softness, retaining highlight detail and physically consistent contact shadows; do not substitute a golden-hour look unless requested.")
  } else if (/indoor|interior|room|window|studio/.test(text)) {
    sentences.push("Use the stated window, room or studio sources and their actual direction and softness, plausible colour balance, light falloff and shadow behaviour; do not invent additional sources.")
  } else {
    sentences.push("Match exposure, light direction, colour and shadow softness to the stated scene and approved look; preserve realistic highlight roll-off without inventing light sources.")
  }
  if (human) sentences.push(sports
    ? "Where visible, preserve natural skin pores, subtle asymmetry, realistic hair and local sweat from exertion, with highlights confined to plausibly damp surfaces rather than uniformly matte or artificially oiled skin. Keep anatomy, posture, weight distribution and ground contact physically credible."
    : "Where visible, preserve natural skin texture, subtle asymmetry and realistic hair without inventing identity details or smoothing the person into plastic skin; keep anatomy, posture and surface contact believable.")
  if (human && !/head.?shot|face close.?up/.test(text)) sentences.push("Visible clothing follows the approved wardrobe, with natural folds, tension and contact with the body; do not redesign or recolour it.")
  if (product) sentences.push("Preserve the referenced geometry, brand colours and exact quoted packaging text; keep requested lettering legible and material reflections and surface contact physically plausible. Do not add unrelated captions or overlays.")
  else if (!characterSheet && !options.entityContext) sentences.push("Keep visible environmental depth and material wear appropriate to this scene, without adding subjects or props.")
  sentences.push("Retain the approved colour and grain treatment, restrained sharpening and believable photographic detail.")
  return LAYER_START + sentences.join(" ") + LAYER_END
}

/** Idempotent, bounded additive layer; never rewrites saved base prompt fields. */
export function composeImagePrompt(options: ImagePromptOptions): string {
  const original = options.prompt.trim()
  const photographic = isPhotographicRequest(original, options.style, options.styleDna)
  // Remove only our own earlier layer; quoted product/brand text is never globally rewritten.
  let base = original.replace(/\n*Photographic treatment: [\s\S]*? Explicit camera, lighting, reference and user choices take precedence over these defaults\./g, "").trim()
  if (options.entityContext && base.endsWith(options.entityContext)) base = base.slice(0, -options.entityContext.length).trim()
  const cameraSuffix = options.camera ? applyCameraSettings("", options.camera, { opticsOnly: true }) : ""
  const framed = options.camera && !options.drawEdit && !base.includes(cameraSuffix)
    ? applyCameraSettings(base, options.camera, { opticsOnly: true }) : base
  const looks = options.style && !explicitStylizedDirection(base)
    ? composeLookDirectives(options.style, options.styleDna, options.block || "shot") : []
  const referenceGrid = options.block === "character" || /character reference sheet|multi.view turnaround/i.test(base)
  const packaging = options.block === "asset" || /packaging|label|wordmark|product_sheet/i.test(base + (options.entityContext || ""))
  // Relax only generated house prohibitions, never an explicit user negative.
  const compatibleLooks = looks.map(line => line
    .replace(referenceGrid ? /collage, grid, /g : /$^/, "")
    .replace(packaging ? /typography, labels, captions, or UI/g : /$^/, "unrelated captions, overlays, or UI; preserve required product lettering"))
  const composition = options.aspectRatio && !original.includes(`Required composition: ${options.aspectRatio}.`)
    ? `Required composition: ${options.aspectRatio}.` : ""
  return [framed, composition, ...compatibleLooks.filter(line => !base.includes(line)),
    photographic && !options.drawEdit ? photographicTreatment(base, options) : "",
    options.entityContext && !base.includes(options.entityContext) ? options.entityContext : "",
  ].filter(Boolean).join("\n\n")
}

/** This is a known local ceiling, not a guess about undocumented provider limits. */
export class ImagePromptValidationError extends Error {
  readonly status = 400
}

export function prepareImageModelPrompt(prompt: string, model: string): string {
  const limit = model.startsWith("higgsfield-ai/soul/") ? 10_000 : null
  if (limit && prompt.length > limit) {
    throw new ImagePromptValidationError(`The composed image prompt exceeds ${model}'s ${limit}-character limit. Shorten the base prompt; identity and product instructions were not truncated.`)
  }
  return prompt
}

/** Capabilities of our current adapters, not a promise about every upstream API. */
export function imageAdapterReferenceLimit(model: string): number | null {
  if (model.startsWith("gpt-image-")) return 16
  if (model.startsWith("dola-")) return 8
  if (model.startsWith("google-")) return 3
  if (model === "fal-gpt-image-2-5-sunburst") return 0
  if (model === "fal-gpt-image-2-5-sunburst-edit") return 16
  if (model.startsWith("fal-flux-")) return 0
  if (model === "higgsfield-ai/soul/v2/standard") return 0
  if (model === "higgsfield-ai/soul/v2/image-to-image") return 1
  return null
}

export function assertImageReferenceCapacity(model: string, count: number): void {
  const limit = imageAdapterReferenceLimit(model)
  if (limit !== null && count > limit) {
    throw new ImagePromptValidationError(`${model} accepts ${limit} reference images through this adapter, but ${count} were selected. Choose a compatible model or explicitly reduce the references; none were silently discarded.`)
  }
}
