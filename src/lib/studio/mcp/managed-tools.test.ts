import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
const mocks = vi.hoisted(() => ({ list: vi.fn(), context: vi.fn(), message: vi.fn(), draft: vi.fn() }))
vi.mock("@/app/api/managed/projects/route", () => ({ GET: mocks.list }))
vi.mock("@/app/api/managed/projects/[projectId]/chat-context/route", () => ({ GET: mocks.context }))
vi.mock("@/app/api/managed/projects/[projectId]/messages/route", () => ({ POST: mocks.message }))
vi.mock("@/app/api/managed/order-drafts/route", async (original) => ({ ...await original<typeof import("@/app/api/managed/order-drafts/route")>(), POST: mocks.draft }))
import { registerManagedMcpTools } from "./managed-tools"
const id = "11111111-1111-4111-8111-111111111111"
let client: Client
let server: McpServer
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STUDIO_MCP_PUBLIC_URL", "https://studio.example")
  mocks.context.mockResolvedValue(Response.json({ fullDeliveryReady: false, project: { id }, progress: { expectedDeliveryAt: null }, deliverables: [], files: [] }))
  mocks.message.mockImplementation(async (request: Request) => Response.json({ sender: request.headers.get("authorization"), ...await request.json() }))
  mocks.list.mockResolvedValue(Response.json({ projects: [{ id, name: "My order" }] }))
})
afterEach(async () => { await client?.close(); await server?.close(); vi.unstubAllEnvs() })
async function connect(scopes: string[]) {
  server = new McpServer({ name: "test", version: "1" })
  registerManagedMcpTools(server, "aih_alice", scopes)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: "test", version: "1" })
  await server.connect(serverTransport); await client.connect(clientTransport)
}
describe("managed customer MCP tools", () => {
  it("supports customer read access independently of Studio generation scopes", async () => {
    await connect(["managed:read"])
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    expect(names).toContain("managed_project_delivery")
    expect(names).not.toContain("managed_project_message")
    const result = await client.callTool({ name: "managed_list_projects" })
    expect(JSON.stringify(result)).toContain("My order")
    expect(mocks.list.mock.calls[0][0].headers.get("authorization")).toBe("Bearer aih_alice")
  })
  it("never promises an incomplete order is a completed delivery", async () => {
    await connect(["managed:read"])
    const result = await client.callTool({ name: "managed_project_delivery", arguments: { projectId: id } })
    expect(JSON.stringify(result)).toContain('\\"ready\\":false')
    expect(JSON.stringify(result)).toContain("not ready yet")
  })
  it("returns the approved final files and project brief when completed", async () => {
    mocks.context.mockResolvedValue(Response.json({ fullDeliveryReady: true, project: { id }, brief: { brandName: "My brand" }, files: [{ title: "Final ad", url: "https://storage.example/signed-final" }], messages: [] }))
    await connect(["managed:read"])
    const result = await client.callTool({ name: "managed_project_delivery", arguments: { projectId: id } })
    expect(JSON.stringify(result)).toContain("My brand")
    expect(JSON.stringify(result)).toContain("signed-final")
  })
  it("forwards customer messages with their own token", async () => {
    await connect(["managed:messages"])
    await client.callTool({ name: "managed_project_message", arguments: { projectId: id, message: "Please shorten the hook" } })
    expect(mocks.message.mock.calls[0][0].headers.get("authorization")).toBe("Bearer aih_alice")
  })
})

it("requires explicit order-draft permission and forwards the authenticated brief", async () => {
  await connect(["managed:read"])
  expect((await client.listTools()).tools.map(t => t.name)).not.toContain("managed_create_order_draft")
  await client.close(); await server.close()
  mocks.draft.mockImplementation(async (request: Request) => Response.json({ checkoutUrl: "https://studio.example/hire-us/brief?draft=mine", auth: request.headers.get("authorization"), ...await request.json() }))
  await connect(["managed:read", "managed:orders"])
  const response = await client.callTool({ name: "managed_create_order_draft", arguments: { serviceType: "ugc", packageKey: "starter", brief: { brandName: "Alice shoes" } } })
  expect(JSON.stringify(response)).toContain("Alice shoes")
  expect(JSON.stringify(response)).toContain("Bearer aih_alice")
  expect(JSON.stringify(response)).toContain("checkoutUrl")
})
