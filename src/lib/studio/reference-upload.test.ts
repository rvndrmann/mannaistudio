import { afterEach, expect, it, vi } from "vitest"
import { prepareReferenceUpload } from "./reference-upload"
afterEach(() => vi.unstubAllGlobals())
it("converts AVIF references to PNG and releases the decoded bitmap", async () => {
  const close = vi.fn()
  const drawImage = vi.fn()
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 900, height: 600, close }))
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage }), toBlob: (cb: (blob: Blob) => void, mime: string) => cb(new Blob(["png bytes"], { type: mime })) }) })
  const normalized = await prepareReferenceUpload(new File(["avif bytes"], "boots.avif", { type: "image/avif" }))
  expect(normalized.name).toBe("boots.png")
  expect(normalized.type).toBe("image/png")
  expect(drawImage).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})
it("keeps supported photos and video uploads unchanged", async () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "video/mp4", "audio/wav"]) {
    const file = new File(["bytes"], "reference", { type })
    expect(await prepareReferenceUpload(file)).toBe(file)
  }
})
