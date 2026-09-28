import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET } from "./route"

const mocks = vi.hoisted(() => ({
  user: vi.fn(), isAdmin: vi.fn(), service: vi.fn(), from: vi.fn(), sign: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }))
vi.mock("@/lib/membership", () => ({ isAdminUser: mocks.isAdmin }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.service }))

const draftId = "00000000-0000-4000-8000-000000000001"
const projectId = "00000000-0000-4000-8000-000000000002"
const ownerId = "00000000-0000-4000-8000-000000000003"
const file = (path: string) => ({ path, name: "reference.jpg", contentType: "image/jpeg", kind: "reference" })
const request = (query: string) => new NextRequest(`http://localhost/api/admin/managed/brief-attachments?${query}`)
const row = (data: unknown) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: "admin" } } })
  mocks.isAdmin.mockResolvedValue(true)
  mocks.service.mockReturnValue({ from: mocks.from, storage: { from: () => ({ createSignedUrl: mocks.sign }) } })
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.example/signed/reference.jpg" }, error: null })
})

describe("admin brief attachments", () => {
  it("rejects signed-out visitors before accessing storage", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } })
    expect((await GET(request(`draftId=${draftId}`))).status).toBe(401)
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("rejects non-admin accounts before accessing storage", async () => {
    mocks.isAdmin.mockResolvedValue(false)
    expect((await GET(request(`draftId=${draftId}`))).status).toBe(403)
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("requires exactly one valid record id", async () => {
    expect((await GET(request(`draftId=${draftId}&projectId=${projectId}`))).status).toBe(400)
    expect((await GET(request("draftId=invalid"))).status).toBe(400)
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("returns 404 for a missing brief", async () => {
    mocks.from.mockReturnValue(row(null))
    expect((await GET(request(`draftId=${draftId}`))).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it("signs saved uploads from the brief owner's folder without public caching", async () => {
    const path = `${ownerId}/managed-briefs/reference.jpg`
    mocks.from.mockReturnValue(row({ profile_id: ownerId, brief: { attachments: [file(path)] } }))
    const response = await GET(request(`draftId=${draftId}`))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(mocks.sign).toHaveBeenCalledWith(path, 3600)
    expect((await response.json()).files[0].url).toBeTruthy()
  })

  it("never signs forged paths outside the uploaded brief assets", async () => {
    const paths = ["someone-else/managed-briefs/private.jpg", `${ownerId}/private.jpg`, `${ownerId}/managed-briefs/../secret.jpg`, `${ownerId}/managed-briefs/nested/private.jpg`]
    mocks.from.mockReturnValue(row({ profile_id: ownerId, brief: { attachments: paths.map(file) } }))
    const response = await GET(request(`draftId=${draftId}`))
    expect((await response.json()).files.every((item: { url: unknown }) => item.url === null)).toBe(true)
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it("uses relocated order uploads for a converted brief", async () => {
    const path = `managed/${projectId}/uploads/reference.jpg`
    mocks.from.mockImplementation((table: string) => row(table === "managed_brief_drafts"
      ? { profile_id: ownerId, converted_project_id: projectId, brief: { attachments: [file(`${ownerId}/managed-briefs/old.jpg`)] } }
      : { user_id: ownerId, brief: { attachments: [file(path)] } }))
    expect((await GET(request(`draftId=${draftId}`))).status).toBe(200)
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(path, 3600)
  })

  it("shows unavailable uploads individually instead of losing the entire list", async () => {
    mocks.from.mockReturnValue(row({ user_id: ownerId, brief: { attachments: [file(`managed/${projectId}/uploads/missing.jpg`)] } }))
    mocks.sign.mockResolvedValue({ data: null, error: { message: "Object not found" } })
    const response = await GET(request(`projectId=${projectId}`))
    expect(response.status).toBe(200)
    expect((await response.json()).files[0]).toMatchObject({ url: null, error: expect.stringContaining("unavailable") })
  })
})
