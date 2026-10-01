import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ context: vi.fn(), sign: vi.fn() }))
vi.mock("@/lib/studio/external-auth", () => ({ requireProjectFromRequest: mocks.context }))
import { GET } from "@/app/api/studio/projects/[projectId]/media/route"
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({ user: { id: "alice" }, supabase: { storage: { from: () => ({ createSignedUrl: mocks.sign }) } } })
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example/alice-signed-file" }, error: null })
})
async function view(path: string) {
  return GET(new NextRequest(`https://studio.example/api/studio/projects/own/media?path=${encodeURIComponent(path)}`, { headers: { authorization: "Bearer aih_alice" } }), { params: Promise.resolve({ projectId: "own" }) })
}
describe("stored media account isolation", () => {
  it("refuses another user's prefix and traversal without asking storage to sign", async () => {
    expect((await view("bob/project/frame.png")).status).toBe(403)
    expect((await view("alice/../bob/frame.png")).status).toBe(400)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it("signs only an owned storage path using the owner's RLS client", async () => {
    const response = await view("alice/project/frame.png")
    expect(response.status).toBe(200)
    expect(mocks.sign).toHaveBeenCalledWith("alice/project/frame.png", 3600)
    expect((await response.json()).url).toContain("alice-signed-file")
  })
})
