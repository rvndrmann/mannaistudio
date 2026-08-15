import { describe, expect, it } from "vitest"
import {
  CLEANUP_MARKS_INSTRUCTION,
  DEFAULT_DRAW_PROMPT,
  compositeFormat,
  composeDrawPrompt,
  distanceToSegment,
  eraseAt,
  hitTest,
  hydrateCanvasObjects,
  isOnResizeHandle,
  isTypingTarget,
  moveObject,
  objectBounds,
  pushHistory,
  resolveAspectRatio,
  serializeCanvasObjects,
  simplifyPoints,
  toCanvasPoint,
  toolForShortcut,
  topmostObjectAt,
  wrapText,
  type CanvasObject,
} from "./draw-edit"

const stroke = (id: string, points: Array<[number, number]>): CanvasObject => ({
  id,
  type: "stroke",
  color: "#eab308",
  brushSize: 5,
  points: points.map(([x, y]) => ({ x, y })),
})

const rect = (id: string, x: number, y: number, width: number, height: number): CanvasObject => ({
  id, type: "rect", color: "#ef4444", brushSize: 5, x, y, width, height,
})

describe("toCanvasPoint", () => {
  it("maps a click on a CSS-scaled canvas back to native image pixels", () => {
    // A 2048x1152 frame displayed 800px wide.
    const rectangle = { left: 100, top: 50, width: 800, height: 450 }
    expect(toCanvasPoint(500, 275, rectangle, 2048, 1152)).toEqual({ x: 1024, y: 576 })
  })

  it("maps corners exactly on a non-square image", () => {
    const rectangle = { left: 0, top: 0, width: 300, height: 533 }
    expect(toCanvasPoint(300, 533, rectangle, 1080, 1920)).toEqual({ x: 1080, y: 1920 })
  })

  it("does not divide by a zero-sized rect", () => {
    expect(toCanvasPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 }, 100, 100)).toEqual({ x: 0, y: 0 })
  })
})

describe("pushHistory", () => {
  it("appends and advances the index", () => {
    const first = pushHistory<string[]>([[]], 0, ["a"])
    expect(first).toEqual({ history: [[], ["a"]], index: 1 })
  })

  it("discards the redo branch when a new action follows an undo", () => {
    const history = [["a"], ["a", "b"], ["a", "b", "c"]]
    const next = pushHistory(history, 0, ["a", "z"])
    expect(next.history).toEqual([["a"], ["a", "z"]])
    expect(next.index).toBe(1)
  })
})

describe("simplifyPoints", () => {
  it("drops points inside the minimum distance but keeps the last one", () => {
    const points = [
      { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }, { x: 10.2, y: 0 },
    ]
    expect(simplifyPoints(points, 2)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10.2, y: 0 }])
  })

  it("leaves a single point alone", () => {
    expect(simplifyPoints([{ x: 3, y: 4 }])).toEqual([{ x: 3, y: 4 }])
  })
})

describe("objectBounds", () => {
  it("normalises a rectangle dragged up and to the left", () => {
    expect(objectBounds(rect("r", 100, 100, -40, -20))).toEqual({ x: 60, y: 80, width: 40, height: 20 })
  })

  it("bounds a stroke by its points", () => {
    expect(objectBounds(stroke("s", [[10, 20], [40, 5], [25, 60]]))).toEqual({ x: 10, y: 5, width: 30, height: 55 })
  })
})

describe("hit testing", () => {
  it("hits a stroke near its path and misses far from it", () => {
    const line = stroke("s", [[0, 0], [100, 0]])
    expect(hitTest(line, { x: 50, y: 3 })).toBe(true)
    expect(hitTest(line, { x: 50, y: 60 })).toBe(false)
  })

  it("hits an arrow along the tail-to-head line", () => {
    const arrow: CanvasObject = { id: "a", type: "arrow", color: "#fff", brushSize: 4, x: 0, y: 0, width: 100, height: 100 }
    expect(hitTest(arrow, { x: 50, y: 50 })).toBe(true)
    expect(hitTest(arrow, { x: 90, y: 10 })).toBe(false)
  })

  it("hits anywhere inside a rectangle, not only on its outline", () => {
    expect(hitTest(rect("r", 0, 0, 100, 100), { x: 50, y: 50 })).toBe(true)
  })

  it("selects the object drawn last when several overlap", () => {
    const objects = [rect("under", 0, 0, 100, 100), rect("over", 10, 10, 50, 50)]
    expect(topmostObjectAt(objects, { x: 30, y: 30 })?.id).toBe("over")
    expect(topmostObjectAt(objects, { x: 500, y: 500 })).toBeNull()
  })

  it("erases only what the pass touches", () => {
    const objects = [rect("a", 0, 0, 20, 20), rect("b", 200, 200, 20, 20)]
    expect(eraseAt(objects, { x: 5, y: 5 }).map((object) => object.id)).toEqual(["b"])
  })

  it("measures distance to a segment, clamped to its ends", () => {
    expect(distanceToSegment({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10)
    expect(distanceToSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(4)
  })

  it("finds the resize handle at the bottom-right of a resizable object", () => {
    const box = rect("r", 0, 0, 400, 400)
    expect(isOnResizeHandle(box, { x: 400, y: 400 }, 900)).toBe(true)
    expect(isOnResizeHandle(box, { x: 200, y: 200 }, 900)).toBe(false)
    expect(isOnResizeHandle(stroke("s", [[0, 0], [400, 400]]), { x: 400, y: 400 }, 900)).toBe(false)
  })
})

describe("moveObject", () => {
  it("shifts every point of a stroke", () => {
    expect(moveObject(stroke("s", [[0, 0], [10, 10]]), 5, -5).points).toEqual([{ x: 5, y: -5 }, { x: 15, y: 5 }])
  })

  it("shifts the origin of a box", () => {
    const moved = moveObject(rect("r", 10, 10, 40, 40), -10, 20)
    expect([moved.x, moved.y, moved.width]).toEqual([0, 30, 40])
  })
})

describe("wrapText", () => {
  // One unit per character, which is what a monospace measurement would give.
  const measure = (value: string) => value.length

  it("wraps at the object width", () => {
    expect(wrapText("move this character to the left", 12, measure)).toEqual([
      "move this", "character to", "the left",
    ])
  })

  it("keeps explicit line breaks", () => {
    expect(wrapText("one\ntwo", 20, measure)).toEqual(["one", "two"])
  })

  it("does not lose a word longer than the width", () => {
    expect(wrapText("supercalifragilistic", 5, measure)).toEqual(["supercalifragilistic"])
  })
})

describe("resolveAspectRatio", () => {
  it("resolves real frame sizes to a ratio the pipeline accepts", () => {
    expect(resolveAspectRatio(1080, 1920)).toBe("9:16")
    expect(resolveAspectRatio(1920, 1080)).toBe("16:9")
    expect(resolveAspectRatio(1024, 1024)).toBe("1:1")
    expect(resolveAspectRatio(2560, 1080)).toBe("21:9")
    expect(resolveAspectRatio(1024, 1536)).toBe("2:3")
  })

  it("falls back rather than returning something unsendable", () => {
    expect(resolveAspectRatio(0, 0)).toBe("9:16")
  })
})

describe("prompt composition", () => {
  it("falls back to the default instruction when the box is empty", () => {
    expect(composeDrawPrompt("   ", false)).toBe(DEFAULT_DRAW_PROMPT)
  })

  it("appends the clean-up instruction only when asked", () => {
    expect(composeDrawPrompt("add a scar", true)).toBe(`add a scar\n\n${CLEANUP_MARKS_INSTRUCTION}`)
    expect(composeDrawPrompt("add a scar", false)).toBe("add a scar")
  })
})

describe("compositeFormat", () => {
  it("keeps PNG for a PNG source so a cutout does not go black", () => {
    expect(compositeFormat("user/project/asset.png").mimeType).toBe("image/png")
  })

  it("uses JPEG for photographic frames", () => {
    const format = compositeFormat("user/project/frame.jpg")
    expect(format.mimeType).toBe("image/jpeg")
    expect(format.quality).toBe(0.92)
  })
})

describe("serialization", () => {
  it("strips the live image element but keeps the storage path", () => {
    const objects: CanvasObject[] = [{
      id: "i1", type: "image", color: "#fff", brushSize: 5, x: 0, y: 0, width: 10, height: 10,
      src: "user/project/ref.png", img: {} as CanvasImageSource,
    }]
    const stored = serializeCanvasObjects(objects)
    expect(stored[0]).not.toHaveProperty("img")
    expect(stored[0].src).toBe("user/project/ref.png")
    expect(JSON.stringify(stored)).toContain("ref.png")
  })

  it("round-trips objects through storage", () => {
    const objects: CanvasObject[] = [
      stroke("s", [[1, 2], [3, 4]]),
      { id: "t", type: "text", color: "#fff", brushSize: 5, x: 5, y: 6, width: 100, height: 40, text: "here", fontSize: 32 },
    ]
    expect(hydrateCanvasObjects(serializeCanvasObjects(objects))).toEqual(objects)
  })

  it("drops entries that could not be replayed", () => {
    const hydrated = hydrateCanvasObjects([
      null,
      { id: "no-type" },
      { id: "bad", type: "spiral" },
      { id: "empty-stroke", type: "stroke", points: [] },
      { id: "image-without-src", type: "image", x: 0, y: 0 },
      { id: "ok", type: "rect", x: 1, y: 2, width: 3, height: 4 },
    ])
    expect(hydrated.map((object) => object.id)).toEqual(["ok"])
  })

  it("is not an array", () => {
    expect(hydrateCanvasObjects("nope")).toEqual([])
  })
})

describe("shortcuts", () => {
  it("maps letters and digits to the same tool", () => {
    expect(toolForShortcut("b")).toBe("pencil")
    expect(toolForShortcut("2")).toBe("pencil")
    expect(toolForShortcut("B")).toBe("pencil")
    expect(toolForShortcut("q")).toBeNull()
  })

  it("recognises fields the caret can be in", () => {
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as Element)).toBe(true)
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as Element)).toBe(true)
    expect(isTypingTarget({ tagName: "DIV" } as unknown as Element)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
