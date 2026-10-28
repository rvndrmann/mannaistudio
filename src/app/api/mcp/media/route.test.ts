import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const sign = vi.hoisted(() => vi.fn())
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ storage: { from: () => ({ createSignedUrl: sign }) } }) }))
import { GET } from "./route"
import { createMediaPass } from "@/lib/studio/mcp/media-pass"

const get = (pass: string, path: string) => GET(new NextRequest(`https://studio.example/api/mcp/media?pass=${encodeURIComponent(pass)}&path=${encodeURIComponent(path)}`))

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
  sign.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://files.example/${path}?sig` }, error: null }))
})

describe("gallery media route", () => {
  it("redirects a pass holder to their own file", async () => {
    const response = await get(createMediaPass("alice"), "alice/p/one.png")
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://files.example/alice/p/one.png?sig")
  })
  it("refuses another account's file, a forged pass and an expired one", async () => {
    expect((await get(createMediaPass("alice"), "bob/p/secret.png")).status).toBe(403)
    expect((await get(createMediaPass("alice"), "alice/../bob/p/secret.png")).status).toBe(403)
    const [payload] = createMediaPass("alice").split(".")
    const bobPayload = Buffer.from(JSON.stringify({ u: "bob", e: 9_999_999_999 })).toString("base64url")
    expect((await get(`${bobPayload}.${createMediaPass("alice").split(".")[1]}`, "bob/p/secret.png")).status).toBe(401)
    expect((await get(`${payload}.forged`, "alice/p/one.png")).status).toBe(401)
    expect((await get(createMediaPass("alice", Date.now() - 2 * 3600_000), "alice/p/one.png")).status).toBe(401)
    // A pass is only as good as the server secret it was minted under.
    const minted = createMediaPass("alice")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "another-key")
    expect((await get(minted, "alice/p/one.png")).status).toBe(401)
    expect(sign).not.toHaveBeenCalled()
  })
})
