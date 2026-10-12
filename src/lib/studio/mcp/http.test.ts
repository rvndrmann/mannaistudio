import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
const aliceProject = "11111111-1111-4111-8111-111111111111"
const bobProject = "22222222-2222-4222-8222-222222222222"
const episode = "33333333-3333-4333-8333-333333333333"
const mocks = vi.hoisted(() => ({ validate: vi.fn(), context: vi.fn(), list: vi.fn(), create: vi.fn(), project: vi.fn(), chat: vi.fn(), decide: vi.fn(), media: vi.fn(), savePrompts: vi.fn(), generate: vi.fn(), advance: vi.fn() }))
vi.mock("@/lib/studio/external-auth", () => ({
  bearerToken: (request: Request) => request.headers.get("authorization")?.replace(/^Bearer /, "") || "",
  validateExternalRequest: mocks.validate,
  requireProjectFromRequest: mocks.context,
}))
vi.mock("@/lib/studio/rate-limit", () => ({ enforceStudioRateLimit: vi.fn() }))
vi.mock("@/app/api/studio/external/projects/route", () => ({ GET: mocks.list, POST: mocks.create }))
vi.mock("@/app/api/studio/projects/[projectId]/route", () => ({ GET: mocks.project }))
vi.mock("@/app/api/studio/projects/[projectId]/director/chat/route", () => ({ POST: mocks.chat }))
vi.mock("@/app/api/studio/projects/[projectId]/director/proposals/[proposalId]/route", () => ({ POST: mocks.decide }))
vi.mock("@/app/api/studio/projects/[projectId]/media/route", () => ({ GET: mocks.media }))
vi.mock("@/lib/studio/advance-jobs", () => ({ advanceGenerationJobs: mocks.advance }))
vi.mock("@/lib/studio/own-prompts", async (original) => ({ ...await original<typeof import("@/lib/studio/own-prompts")>(), saveOwnPrompts: mocks.savePrompts, proposeOwnGeneration: mocks.generate }))
import { POST } from "@/app/api/mcp/route"
import { StudioAccessError } from "@/lib/studio/server-context"
const clients: Client[] = []
function token(request: Request) { return request.headers.get("authorization")?.slice(7) || "" }
async function connect(access: string) {
  const client = new Client({ name: "test-client", version: "1" })
  clients.push(client)
  const transport = new StreamableHTTPClientTransport(new URL("https://studio.example/api/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${access}` } },
    fetch: async (input, init) => POST(new Request(input, init)),
  })
  await client.connect(transport)
  return client
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "https://studio.example")
  mocks.validate.mockImplementation(async (request: Request) => {
    const access = token(request)
    if (access === "revoked") throw new StudioAccessError("Invalid MCP connection", 401)
    if (!access) return null
    return { user: { id: access }, supabase: {}, connectionId: access === "manual-token" ? null : "connection", resource: "https://studio.example/api/mcp", scopes: access === "read-only" ? ["projects:read"] : ["projects:read", "projects:write", "director:chat", "director:proposals"] }
  })
  mocks.list.mockImplementation(async (request: Request) => Response.json({ projects: [{ id: token(request) === "bob" ? bobProject : aliceProject, name: `${token(request)}'s project` }] }))
  mocks.create.mockImplementation(async (request: Request) => Response.json({ project: { user_id: token(request), ...await request.json() }, episodeId: episode }))
  mocks.context.mockImplementation(async (request: Request, projectId: string) => {
    const owner = token(request)
    if (projectId !== (owner === "bob" ? bobProject : aliceProject)) throw new StudioAccessError("Project not found", 404)
    const from = (table: string) => {
      const filters: Record<string, unknown> = {}
      const q = { select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q }, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: table === "creator_episodes" && (!filters.id || filters.id === episode) ? { id: episode } : null, error: null }) }
      return q
    }
    return { user: { id: owner }, project: { id: projectId, user_id: owner }, supabase: { from } }
  })
  mocks.project.mockResolvedValue(Response.json({ project: { id: aliceProject }, activeEpisode: { id: episode }, shots: [], entities: [] }))
  mocks.chat.mockImplementation(async (request: Request) => Response.json({ account: token(request), received: await request.json() }))
})
afterEach(async () => { await Promise.all(clients.splice(0).map((client) => client.close())); vi.unstubAllEnvs() })
describe("hosted MCP with the real SDK HTTP client", () => {
  it("challenges unauthenticated, revoked and non-OAuth credentials", async () => {
    const noToken = await POST(new Request("https://studio.example/api/mcp", { method: "POST" }))
    expect(noToken.status).toBe(401)
    expect(noToken.headers.get("www-authenticate")).toContain("oauth-protected-resource")
    for (const value of ["manual-token", "revoked"]) {
      const response = await POST(new Request("https://studio.example/api/mcp", { method: "POST", headers: { authorization: `Bearer ${value}` } }))
      expect(response.status).toBe(401)
    }
  })
  it("keeps concurrent users' tool requests bound to their own bearer", async () => {
    const [alice, bob] = await Promise.all([connect("alice"), connect("bob")])
    const results = await Promise.all([alice.callTool({ name: "studio_list_projects" }), bob.callTool({ name: "studio_list_projects" })])
    expect(JSON.stringify(results[0])).toContain("alice's project")
    expect(JSON.stringify(results[0])).not.toContain("bob's project")
    expect(JSON.stringify(results[1])).toContain("bob's project")
  })
  it("denies a guessed project UUID before reading its state or sending chat", async () => {
    const alice = await connect("alice")
    const result = await alice.callTool({ name: "studio_storyboard", arguments: { projectId: bobProject } })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain("Project not found")
    expect(mocks.project).not.toHaveBeenCalled()
    const chatResult = await alice.callTool({ name: "studio_chat", arguments: { projectId: bobProject, message: "Generate a video" } })
    expect(chatResult.isError).toBe(true)
    expect(mocks.chat).not.toHaveBeenCalled()
  })
  it("creates on the connected account and uses the owned episode for chat", async () => {
    const alice = await connect("alice")
    const created = await alice.callTool({ name: "studio_create_project", arguments: { name: "My ad", user_id: "bob" } })
    expect(JSON.stringify(created)).toContain('\\"user_id\\":\\"alice\\"')
    const reply = await alice.callTool({ name: "studio_chat", arguments: { projectId: aliceProject, message: "Plan my ad" } })
    expect(reply.isError).not.toBe(true)
    expect(JSON.stringify(reply)).toContain(episode)
    const foreignSession = await alice.callTool({ name: "studio_chat", arguments: { projectId: aliceProject, sessionId: bobProject, message: "Read this conversation" } })
    expect(foreignSession.isError).toBe(true)
    expect(mocks.chat).toHaveBeenCalledTimes(1)
  })
  it("saves own prompts and proposes own renders on the caller's project and episode, and nowhere else", async () => {
    mocks.savePrompts.mockResolvedValue({ saved: [{ shotNumber: 1, saved: ["imagePrompt"] }] })
    mocks.generate.mockResolvedValue({ approvalRequired: true, proposal: { id: "proposal", estimated_credits: 12 } })
    const alice = await connect("alice")
    const { tools } = await alice.listTools()
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["studio_set_prompts", "studio_generate"]))
    const saved = await alice.callTool({ name: "studio_set_prompts", arguments: { projectId: aliceProject, shots: [{ shotNumber: 1, imagePrompt: "A red door." }] } })
    expect(saved.isError).not.toBe(true)
    expect(mocks.savePrompts.mock.calls[0][1]).toBe(episode)
    expect(mocks.savePrompts.mock.calls[0][2]).toMatchObject({ shots: [{ shotNumber: 1, imagePrompt: "A red door." }] })
    const proposed = await alice.callTool({ name: "studio_generate", arguments: { projectId: aliceProject, kind: "storyboard_image", shotNumbers: [1] } })
    expect(JSON.stringify(proposed)).toContain("approvalRequired")
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ user: { id: "alice" }, project: { id: aliceProject } })
    const foreign = await alice.callTool({ name: "studio_generate", arguments: { projectId: bobProject, kind: "storyboard_image", shotNumbers: [1] } })
    expect(foreign.isError).toBe(true)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
  it("shows an image in the chat itself and hands back a link for anything else", async () => {
    mocks.media.mockImplementation(async (request: Request) => {
      const path = new URL(request.url).searchParams.get("path")
      return Response.json({ path, url: `https://files.example/${path}`, expiresInSeconds: 3600 })
    })
    const download = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }))
    const alice = await connect("alice")
    const image = await alice.callTool({ name: "studio_view_media", arguments: { projectId: aliceProject, path: "alice/p/frame.png" } }) as { content: Array<{ type: string; mimeType?: string; data?: string }> }
    expect(image.content[0]).toMatchObject({ type: "image", mimeType: "image/png", data: Buffer.from([137, 80, 78, 71]).toString("base64") })
    expect(image.content[1].type).toBe("text")
    download.mockClear()
    const video = await alice.callTool({ name: "studio_view_media", arguments: { projectId: aliceProject, path: "alice/p/clip.mp4" } })
    expect(JSON.stringify(video)).toContain("https://files.example/alice/p/clip.mp4")
    expect(JSON.stringify(video)).not.toContain('"type":"image"')
    expect(download).not.toHaveBeenCalled()
    download.mockRestore()
  })
  it("moves unfinished jobs forward when pending work is read, and still answers if that fails", async () => {
    mocks.project.mockImplementation(async () => Response.json({ actionProposals: [], production: { generationJobs: [{ id: "job", status: "completed" }], spend: { episode: 4 } } }))
    mocks.advance.mockResolvedValue({ checked: 2, stillWorking: true })
    const alice = await connect("alice")
    const working = await alice.callTool({ name: "studio_pending_work", arguments: { projectId: aliceProject } })
    expect(mocks.advance.mock.calls[0][0]).toMatchObject({ user: { id: "alice" }, project: { id: aliceProject } })
    expect(JSON.stringify(working)).toContain("Call this again shortly")
    mocks.advance.mockRejectedValue(new Error("provider down"))
    const afterFailure = await alice.callTool({ name: "studio_pending_work", arguments: { projectId: aliceProject } })
    expect(afterFailure.isError).not.toBe(true)
    expect(JSON.stringify(afterFailure)).toContain("completed")
    const foreign = await alice.callTool({ name: "studio_pending_work", arguments: { projectId: bobProject } })
    expect(foreign.isError).toBe(true)
    expect(mocks.advance).toHaveBeenCalledTimes(2)
  })
  it("exposes only consented tools and refuses a foreign browser Origin", async () => {
    const reader = await connect("read-only")
    const { tools } = await reader.listTools()
    expect(tools.map((tool) => tool.name)).not.toContain("studio_create_project")
    expect(tools.map((tool) => tool.name)).not.toContain("studio_chat")
    // Writing prompts and asking for renders are creative work, not reading.
    expect(tools.map((tool) => tool.name)).not.toContain("studio_set_prompts")
    expect(tools.map((tool) => tool.name)).not.toContain("studio_generate")
    const response = await POST(new Request("https://studio.example/api/mcp", { method: "POST", headers: { origin: "https://attacker.example", authorization: "Bearer alice" } }))
    expect(response.status).toBe(403)
  })
})
