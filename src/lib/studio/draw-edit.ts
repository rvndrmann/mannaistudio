/**
 * Draw-to-edit: the geometry, history, and prompt rules behind drawing on a
 * generated image and asking a model to apply the marks.
 *
 * The marks are not metadata. Everything drawn here is flattened into the
 * pixels of the image that gets sent, and the text prompt is what explains
 * what the marks mean. That is why the tools are deliberately few and loud —
 * a red box and an arrow read as instructions to an edit model, a subtle
 * annotation layer does not.
 *
 * Kept free of React and of any canvas element so the parts that are easy to
 * get wrong — coordinate mapping, the undo stack, hit testing, word wrap — can
 * be tested without a DOM.
 */

export type DrawTool = "pointer" | "pencil" | "eraser" | "rect" | "arrow" | "text" | "image"

export type CanvasObjectType = "stroke" | "rect" | "arrow" | "text" | "image"

export type CanvasPoint = { x: number; y: number }

export type CanvasObject = {
  id: string
  type: CanvasObjectType
  color: string
  brushSize: number
  /** stroke only */
  points?: CanvasPoint[]
  /** rect / arrow / text / image. For an arrow, width/height is the tail→head delta. */
  x?: number
  y?: number
  width?: number
  height?: number
  /** text only */
  text?: string
  fontSize?: number
  /** image only: the storage path it was uploaded to, and the live element to draw. */
  src?: string
  img?: CanvasImageSource
}

/**
 * Eight saturated presets. Muted colours are a trap here: the model has to be
 * able to tell a mark from the photograph underneath it.
 */
export const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ffffff", // white
  "#000000", // black
] as const

export const DEFAULT_COLOR = "#eab308"
export const DEFAULT_BRUSH_SIZE = 5

/** Both a letter and a digit, so the toolbar can be driven either way. */
export const TOOL_SHORTCUTS: Record<string, DrawTool> = {
  v: "pointer", "1": "pointer",
  b: "pencil", "2": "pencil",
  e: "eraser", "3": "eraser",
  r: "rect", "4": "rect",
  a: "arrow", "5": "arrow",
  t: "text", "6": "text",
  i: "image", "7": "image",
}

export function toolForShortcut(key: string): DrawTool | null {
  return TOOL_SHORTCUTS[key.toLowerCase()] || null
}

/**
 * True while the caret is in a field. Without this check, typing "brush" in the
 * prompt box swaps the tool four times mid-sentence.
 */
export function isTypingTarget(element: Element | null | undefined): boolean {
  if (!element) return false
  const tag = element.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return (element as HTMLElement).isContentEditable === true
}

/**
 * Pointer position in canvas pixels.
 *
 * The canvas is sized to the source image's native resolution and scaled down
 * with CSS, so the pointer arrives in CSS space and every mark would land
 * short of the cursor without this conversion. Getting it wrong fails quietly:
 * the strokes are simply somewhere else than where they were drawn.
 */
export function toCanvasPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): CanvasPoint {
  if (!rect.width || !rect.height) return { x: 0, y: 0 }
  return {
    x: (clientX - rect.left) * (canvasWidth / rect.width),
    y: (clientY - rect.top) * (canvasHeight / rect.height),
  }
}

/**
 * Commit one change to the undo stack.
 *
 * Truncating anything after the current index is what stops redo from
 * resurrecting marks off a timeline the user already abandoned.
 */
export function pushHistory<T>(history: T[], index: number, next: T): { history: T[]; index: number } {
  const trimmed = history.slice(0, index + 1)
  trimmed.push(next)
  return { history: trimmed, index: trimmed.length - 1 }
}

/**
 * Drop points the pointer barely moved between. A single slow stroke otherwise
 * collects thousands of near-identical points, all of which get serialized and
 * stored so the edit can be reopened.
 */
export function simplifyPoints(points: CanvasPoint[], minDistance = 2): CanvasPoint[] {
  if (points.length < 2) return [...points]
  const kept: CanvasPoint[] = [points[0]]
  for (let index = 1; index < points.length; index += 1) {
    const previous = kept[kept.length - 1]
    const point = points[index]
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= minDistance) kept.push(point)
  }
  // The last point always survives: dropping it visibly shortens the stroke.
  const last = points[points.length - 1]
  const tail = kept[kept.length - 1]
  if (tail.x !== last.x || tail.y !== last.y) kept.push(last)
  return kept
}

export type Bounds = { x: number; y: number; width: number; height: number }

/** Axis-aligned bounds with width/height always positive, whichever way it was dragged. */
export function objectBounds(object: CanvasObject): Bounds {
  if (object.type === "stroke") {
    const points = object.points || []
    if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
  }
  const x = object.x || 0
  const y = object.y || 0
  const width = object.width || 0
  const height = object.height || 0
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  }
}

export function distanceToSegment(point: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/**
 * Whether a click lands on an object.
 *
 * Strokes and arrows are thin, so they are hit along their path with a
 * tolerance; rectangles, text, and inserted images are hit anywhere inside
 * their box, which is what people expect from a selection tool even though a
 * drawn rectangle is only an outline.
 */
export function hitTest(object: CanvasObject, point: CanvasPoint, tolerance = 8): boolean {
  const reach = Math.max(tolerance, (object.brushSize || 0) / 2 + 4)
  if (object.type === "stroke") {
    const points = object.points || []
    if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= reach
    for (let index = 1; index < points.length; index += 1) {
      if (distanceToSegment(point, points[index - 1], points[index]) <= reach) return true
    }
    return false
  }
  if (object.type === "arrow") {
    const tail = { x: object.x || 0, y: object.y || 0 }
    const head = { x: tail.x + (object.width || 0), y: tail.y + (object.height || 0) }
    return distanceToSegment(point, tail, head) <= reach
  }
  const bounds = objectBounds(object)
  return point.x >= bounds.x - reach
    && point.x <= bounds.x + bounds.width + reach
    && point.y >= bounds.y - reach
    && point.y <= bounds.y + bounds.height + reach
}

/** The object a click selects: the last drawn one under the cursor, i.e. the visible one. */
export function topmostObjectAt(objects: CanvasObject[], point: CanvasPoint, tolerance = 8): CanvasObject | null {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    if (hitTest(objects[index], point, tolerance)) return objects[index]
  }
  return null
}

/** Which objects an eraser pass removes. Object-level, not pixel-level — see the modal's label. */
export function eraseAt(objects: CanvasObject[], point: CanvasPoint, tolerance = 8): CanvasObject[] {
  return objects.filter((object) => !hitTest(object, point, tolerance))
}

export function moveObject(object: CanvasObject, dx: number, dy: number): CanvasObject {
  if (object.type === "stroke") {
    return { ...object, points: (object.points || []).map((point) => ({ x: point.x + dx, y: point.y + dy })) }
  }
  return { ...object, x: (object.x || 0) + dx, y: (object.y || 0) + dy }
}

/** Resize handle size in canvas pixels, scaled so it stays grabbable on a 4K frame. */
export function handleSize(canvasWidth: number): number {
  return Math.max(10, Math.round(canvasWidth / 90))
}

/** Resizable from the bottom-right corner only: strokes and arrows are redrawn instead. */
export function isResizable(object: CanvasObject): boolean {
  return object.type === "rect" || object.type === "image" || object.type === "text"
}

export function isOnResizeHandle(object: CanvasObject, point: CanvasPoint, canvasWidth: number): boolean {
  if (!isResizable(object)) return false
  const bounds = objectBounds(object)
  const size = handleSize(canvasWidth)
  return Math.abs(point.x - (bounds.x + bounds.width)) <= size
    && Math.abs(point.y - (bounds.y + bounds.height)) <= size
}

/**
 * Break text into lines that fit `maxWidth`.
 *
 * Takes the measuring function rather than a canvas context so the wrap can be
 * tested, and so the same lines are produced for the on-screen overlay and for
 * the exported composite. Unwrapped text runs straight off the frame and out
 * of the image that gets sent.
 */
export function wrapText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }
    let current = words[0]
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${current} ${words[index]}`
      if (measure(candidate) <= maxWidth) current = candidate
      else {
        lines.push(current)
        current = words[index]
      }
    }
    lines.push(current)
  }
  return lines
}

/** Line box height for a given font size, matching the renderer's baseline step. */
export const TEXT_LINE_HEIGHT = 1.3

export const SUPPORTED_ASPECT_RATIOS = ["9:16", "16:9", "1:1", "2:3", "3:2", "21:9"] as const

/**
 * The nearest ratio the pipeline actually accepts.
 *
 * "Auto" cannot be sent — the providers either error on it or ignore it — and
 * an edit that comes back in a different shape from the frame it edited is
 * useless in a storyboard, so the source image's own proportions decide.
 */
export function resolveAspectRatio(width: number, height: number): string {
  if (!width || !height) return "9:16"
  const target = width / height
  let best = SUPPORTED_ASPECT_RATIOS[0] as string
  let bestDelta = Number.POSITIVE_INFINITY
  for (const ratio of SUPPORTED_ASPECT_RATIOS) {
    const [w, h] = ratio.split(":").map(Number)
    const delta = Math.abs(Math.log(target / (w / h)))
    if (delta < bestDelta) {
      bestDelta = delta
      best = ratio
    }
  }
  return best
}

export type DrawBlockType = "character" | "asset" | "shot"

/**
 * What the prompt box starts with per block.
 *
 * An edit model given only marks will happily redraw the whole frame, so each
 * seed names what must survive the edit as well as what the marks are for.
 */
export const SEEDED_PROMPTS: Record<DrawBlockType, string> = {
  character: "Apply the marked changes to the character. Keep the face, identity, and proportions unchanged.",
  asset: "Apply the marked changes to the object. Keep the shape and material consistent.",
  shot: "Edit the image based on the drawing overlay. Keep the existing composition and lighting.",
}

export const DEFAULT_DRAW_PROMPT = "Edit the image based on the drawing overlay"

/**
 * Edit models routinely paint the annotation back into the result. Asking for
 * the marks to be removed is the only reliable fix, and it is a toggle rather
 * than always-on because it costs prompt weight the user may want elsewhere.
 */
export const CLEANUP_MARKS_INSTRUCTION = "Remove all of the coloured drawing marks, boxes, arrows, and text overlays from the final image — they are instructions, not content."

export function composeDrawPrompt(promptText: string, cleanUpMarks: boolean): string {
  const base = promptText.trim() || DEFAULT_DRAW_PROMPT
  return cleanUpMarks ? `${base}\n\n${CLEANUP_MARKS_INSTRUCTION}` : base
}

/**
 * PNG only when the source was PNG.
 *
 * JPEG flattens alpha to black, which ruins an asset plate cut out on
 * transparency; everything else is a photographic frame where JPEG at 0.92 is
 * indistinguishable and a fraction of the upload.
 */
export function compositeFormat(sourcePath: string): { mimeType: string; extension: string; quality: number } {
  return /\.png($|\?)/i.test(sourcePath)
    ? { mimeType: "image/png", extension: "png", quality: 1 }
    : { mimeType: "image/jpeg", extension: "jpg", quality: 0.92 }
}

export type StoredCanvasObject = Omit<CanvasObject, "img">

/**
 * Drop the live image elements before storing. They do not survive JSON, and
 * the storage path in `src` is what a reopened edit rehydrates them from.
 */
export function serializeCanvasObjects(objects: CanvasObject[]): StoredCanvasObject[] {
  return objects.map((object) => {
    const { img: _img, ...rest } = object
    void _img
    return rest
  })
}

/**
 * Read objects back out of jsonb. Anything unrecognised is dropped rather than
 * trusted: a stored edit is replayed straight onto a canvas.
 */
export function hydrateCanvasObjects(value: unknown): StoredCanvasObject[] {
  if (!Array.isArray(value)) return []
  const types: CanvasObjectType[] = ["stroke", "rect", "arrow", "text", "image"]
  const objects: StoredCanvasObject[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    if (typeof record.id !== "string") continue
    if (typeof record.type !== "string" || !types.includes(record.type as CanvasObjectType)) continue
    const object: StoredCanvasObject = {
      id: record.id,
      type: record.type as CanvasObjectType,
      color: typeof record.color === "string" ? record.color : DEFAULT_COLOR,
      brushSize: typeof record.brushSize === "number" ? record.brushSize : DEFAULT_BRUSH_SIZE,
    }
    if (Array.isArray(record.points)) {
      object.points = record.points
        .filter((point): point is CanvasPoint =>
          Boolean(point) && typeof point === "object"
          && typeof (point as CanvasPoint).x === "number"
          && typeof (point as CanvasPoint).y === "number")
        .map((point) => ({ x: point.x, y: point.y }))
    }
    for (const key of ["x", "y", "width", "height", "fontSize"] as const) {
      if (typeof record[key] === "number") object[key] = record[key] as number
    }
    if (typeof record.text === "string") object.text = record.text
    if (typeof record.src === "string") object.src = record.src
    if (object.type === "stroke" && !object.points?.length) continue
    if (object.type === "image" && !object.src) continue
    objects.push(object)
  }
  return objects
}

/** The shape stored on the generation job, so an edit can be reopened and adjusted. */
export type DrawEditRecord = {
  sourceImage: string
  compositeImage: string
  objects: StoredCanvasObject[]
}

export function readDrawEditRecord(value: unknown): DrawEditRecord | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.sourceImage !== "string" || typeof record.compositeImage !== "string") return null
  return {
    sourceImage: record.sourceImage,
    compositeImage: record.compositeImage,
    objects: hydrateCanvasObjects(record.objects),
  }
}
