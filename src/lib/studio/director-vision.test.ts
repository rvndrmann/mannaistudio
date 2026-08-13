import { afterEach, describe, expect, it, vi } from "vitest"
import { buildVisionUserContent, collectDirectorVisionAttachments } from "./director-vision"

/**
 * The provider downloads a remote image itself and gives up quickly, so a
 * multi-megabyte keyframe on slow storage failed the whole run with "Unable to
 * download content from the provided URL before the timeout". Attachments are
 * read here and sent inline; anything that cannot be read in time is dropped
 * rather than handed over as a URL that would fail the same way.
 */

const png = (bytes: number) => Buffer.alloc(bytes, 1)

function imageResponse(body: Buffer, contentType = "image/png") {
  return {
    ok: true,
    headers: new Headers({ "content-type": contentType, "content-length": String(body.byteLength) }),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  } as unknown as Response
}

function supabaseWith(paths: string[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            order: () => ({ limit: async () => ({ data: [] }) }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => paths.includes(path)
          ? { data: { signedUrl: `https://storage.test/${path}` }, error: null }
          : { data: null, error: new Error("missing") },
      }),
    },
  } as never
}

afterEach(() => { vi.unstubAllGlobals() })

describe("director vision attachments", () => {
  const entity = (name: string, path: string) => ({ id: name, name, type: "character" as const, reference_images: [path] })

  it("sends the image inline rather than a URL the provider has to fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(64), "image/jpeg")))
    const attachments = await collectDirectorVisionAttachments({
      supabase: supabaseWith(["lena.png"]),
      projectId: "p",
      mentionedEntities: [entity("Lena", "lena.png")],
    })
    expect(attachments).toHaveLength(1)
    expect(attachments[0].url.startsWith("data:image/jpeg;base64,")).toBe(true)
    expect(attachments[0].label).toBe("reference art for @Lena")
  })

  it("drops an image that is too large to inline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(5 * 1024 * 1024))))
    const attachments = await collectDirectorVisionAttachments({
      supabase: supabaseWith(["huge.png"]),
      projectId: "p",
      mentionedEntities: [entity("Huge", "huge.png")],
    })
    expect(attachments).toEqual([])
  })

  it("drops an unreachable reference instead of failing the run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timed out") }))
    const attachments = await collectDirectorVisionAttachments({
      supabase: supabaseWith(["slow.png"]),
      projectId: "p",
      mentionedEntities: [entity("Slow", "slow.png")],
    })
    expect(attachments).toEqual([])
  })

  it("ignores a response that is not an image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(64), "text/html")))
    const attachments = await collectDirectorVisionAttachments({
      supabase: supabaseWith(["page.png"]),
      projectId: "p",
      mentionedEntities: [entity("Page", "page.png")],
    })
    expect(attachments).toEqual([])
  })

  it("labels each image so the model can tell them apart", () => {
    const content = buildVisionUserContent("Look at these", [
      { label: "reference art for @Lena", url: "data:image/png;base64,AAA" },
    ])
    expect(Array.isArray(content)).toBe(true)
    expect(content).toContainEqual({ type: "input_text", text: "Image: reference art for @Lena" })
    expect(content).toContainEqual({ type: "input_image", image_url: "data:image/png;base64,AAA" })
  })

  it("leaves a plain message alone when there is nothing to look at", () => {
    expect(buildVisionUserContent("No images here", [])).toBe("No images here")
  })
})
