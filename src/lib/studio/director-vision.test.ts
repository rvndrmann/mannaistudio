import { afterEach, describe, expect, it, vi } from "vitest"
import { buildVisionUserContent, collectDirectorVisionAttachments, collectRequestedMedia } from "./director-vision"

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

/**
 * Measured before this gate existed: one "how many shots does this episode
 * have?" attached four storyboard keyframes — 8.65 MB of PNG, 11.54 MB once
 * base64-encoded. 7.2s went on downloading and encoding them and 25.3s on
 * uploading the request, to produce a 47-token sentence. The pictures were
 * about 99% of the bytes and 32 of the 36 seconds, and none of them was needed.
 */
describe("images travel only when the turn actually points at one", () => {
  const sessionSupabase = (messages: Array<{ role: string; media: unknown }>, extras: Record<string, unknown> = {}) => ({
    from: (table: string) => {
      if (table === "creator_chat_messages") {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: messages }) }) }) }) }
      }
      return (extras[table] as never) ?? { select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }
    },
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}` }, error: null }) }) },
  }) as never

  it("attaches nothing to a plain text question", async () => {
    const fetchSpy = vi.fn(async () => imageResponse(png(64)))
    vi.stubGlobal("fetch", fetchSpy)
    const attachments = await collectDirectorVisionAttachments({
      supabase: sessionSupabase([{ role: "assistant", media: [{ path: "shots/1.png", type: "image" }] }]),
      projectId: "p1",
      sessionId: "s1",
      episodeId: "e1",
    })
    expect(attachments).toEqual([])
    // Nothing was even downloaded — the saving is in the fetch, not just the send.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("still attaches reference art for an entity the user @mentioned", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(64))))
    const attachments = await collectDirectorVisionAttachments({
      supabase: sessionSupabase([]),
      projectId: "p1",
      mentionedEntities: [{ id: "e", name: "Sara", type: "character", reference_images: ["entities/sara.png"] } as never],
    })
    expect(attachments).toHaveLength(1)
    expect(attachments[0].label).toBe("reference art for @Sara")
  })

  it("attaches what the user just uploaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(64))))
    const attachments = await collectDirectorVisionAttachments({
      supabase: sessionSupabase([{ role: "user", media: [{ path: "uploads/new.png", type: "image" }] }]),
      projectId: "p1",
      sessionId: "s1",
    })
    expect(attachments).toHaveLength(1)
    expect(attachments[0].label).toBe("image the user just attached")
  })

  it("stops at the last thing the Director said, so old uploads do not ride along forever", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(64))))
    const attachments = await collectDirectorVisionAttachments({
      // Newest first, as the query returns them: nothing new, then the
      // Director's last reply, then an upload from a turn already answered.
      supabase: sessionSupabase([
        { role: "user", media: [] },
        { role: "assistant", media: [] },
        { role: "user", media: [{ path: "uploads/old.png", type: "image" }] },
      ]),
      projectId: "p1",
      sessionId: "s1",
    })
    expect(attachments).toEqual([])
  })
})

describe("look_at_media fetches exactly what was asked for", () => {
  const supabase = () => ({
    from: (table: string) => table === "creator_shots"
      ? { select: () => ({ eq: () => ({ in: async () => ({ data: [{ order_index: 2, keyframe_image: "shots/3.png" }] }) }) }) }
      : { select: () => ({ eq: async () => ({ data: [{ id: "1", name: "Sara", type: "character", reference_images: ["entities/sara.png"] }] }) }) },
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}` }, error: null }) }) },
  }) as never

  it("resolves a 1-based shot number to that shot's keyframe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(64))))
    const media = await collectRequestedMedia({ supabase: supabase(), projectId: "p1", episodeId: "e1", shotNumbers: [3] })
    expect(media).toHaveLength(1)
    expect(media[0].label).toBe("current keyframe for shot 3")
  })

  it("finds an entity by name whether or not the model wrote the @", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imageResponse(png(64))))
    const withAt = await collectRequestedMedia({ supabase: supabase(), projectId: "p1", entityNames: ["@Sara"] })
    const withoutAt = await collectRequestedMedia({ supabase: supabase(), projectId: "p1", entityNames: ["sara"] })
    expect(withAt).toHaveLength(1)
    expect(withoutAt).toHaveLength(1)
  })

  it("asks for nothing when it was given nothing", async () => {
    const fetchSpy = vi.fn(async () => imageResponse(png(64)))
    vi.stubGlobal("fetch", fetchSpy)
    expect(await collectRequestedMedia({ supabase: supabase(), projectId: "p1" })).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
