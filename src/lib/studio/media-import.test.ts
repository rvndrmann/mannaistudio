import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dns = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock("node:dns/promises", () => ({ lookup: dns.lookup }))

import { fetchPublicMedia } from "./media-import"

const png = new Uint8Array([137, 80, 78, 71])
const file = (body: Uint8Array, headers: Record<string, string> = { "content-type": "image/png" }, status = 200) => new Response(new Blob([new Uint8Array(body)]), { status, headers })

beforeEach(() => { dns.lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]) })
afterEach(() => { vi.restoreAllMocks() })

describe("fetchPublicMedia", () => {
  it("fetches a public image and names it from the link", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(file(png))
    const media = await fetchPublicMedia("https://cdn.example.com/shop/Red%20Shoe.png?v=3")
    expect(media).toMatchObject({ contentType: "image/png", name: "Red Shoe.png" })
    expect(Array.from(media.bytes)).toEqual(Array.from(png))
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "manual" })
  })

  it("believes the extension only when the server gives no useful type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(file(png, { "content-type": "application/octet-stream" }))
    expect((await fetchPublicMedia("https://cdn.example.com/clip.mp4")).contentType).toBe("video/mp4")
  })

  it("refuses a web page, even one whose address ends like a picture", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(file(png, { "content-type": "text/html; charset=utf-8" }))
    await expect(fetchPublicMedia("https://example.com/photo.png")).rejects.toThrow("not the picture itself")
  })

  it("refuses anything that is not https, before any request", async () => {
    const request = vi.spyOn(globalThis, "fetch")
    for (const url of ["http://example.com/a.png", "file:///etc/passwd", "ftp://example.com/a.png", "example.com/a.png"]) {
      await expect(fetchPublicMedia(url)).rejects.toThrow("public https link")
    }
    expect(request).not.toHaveBeenCalled()
  })

  it("refuses private, loopback and metadata addresses, by literal and by DNS", async () => {
    const request = vi.spyOn(globalThis, "fetch")
    for (const url of ["https://127.0.0.1/a.png", "https://10.0.0.5/a.png", "https://169.254.169.254/latest/meta-data", "https://localhost/a.png", "https://metadata.google.internal/a.png"]) {
      await expect(fetchPublicMedia(url)).rejects.toThrow()
    }
    // A public-looking name that resolves inside the network.
    dns.lookup.mockResolvedValue([{ address: "192.168.1.10", family: 4 }])
    await expect(fetchPublicMedia("https://innocent.example.com/a.png")).rejects.toThrow("public address")
    expect(request).not.toHaveBeenCalled()
  })

  it("re-checks every redirect, so a public link cannot bounce inward", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }))
    await expect(fetchPublicMedia("https://cdn.example.com/a.png")).rejects.toThrow("cannot follow")
    expect(request).toHaveBeenCalledTimes(1)
    request.mockReset().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://cdn.example.com/a.png" } }))
    await expect(fetchPublicMedia("https://cdn.example.com/a.png")).rejects.toThrow("public address")
  })

  it("follows a redirect to another public file", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://files.example.com/real.jpg" } }))
      .mockResolvedValueOnce(file(png, { "content-type": "image/jpeg" }))
    expect(await fetchPublicMedia("https://cdn.example.com/short")).toMatchObject({ contentType: "image/jpeg", name: "real.jpg" })
  })

  it("gives up on a redirect loop", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 302, headers: { location: "https://cdn.example.com/again.png" } }))
    await expect(fetchPublicMedia("https://cdn.example.com/a.png")).rejects.toThrow("too many times")
  })

  it("stops at the size limit whether or not the server admits the size", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(file(png, { "content-type": "image/png", "content-length": "999" }))
    await expect(fetchPublicMedia("https://cdn.example.com/a.png", 100)).rejects.toThrow("100MB")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(file(new Uint8Array(500)))
    await expect(fetchPublicMedia("https://cdn.example.com/a.png", 100)).rejects.toThrow("100MB")
  })

  it("explains an error status and an empty file", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(file(png, { "content-type": "image/png" }, 403))
    await expect(fetchPublicMedia("https://cdn.example.com/a.png")).rejects.toThrow("403")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(file(new Uint8Array(0)))
    await expect(fetchPublicMedia("https://cdn.example.com/a.png")).rejects.toThrow("empty")
  })
})
