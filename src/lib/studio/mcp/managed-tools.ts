import { NextRequest } from "next/server"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { GET as list } from "@/app/api/managed/projects/route"
import { GET as context } from "@/app/api/managed/projects/[projectId]/chat-context/route"
import { POST as message } from "@/app/api/managed/projects/[projectId]/messages/route"
import { POST as createDraft, orderDraftSchema } from "@/app/api/managed/order-drafts/route"
import { loadCatalogue } from "@/lib/managed/catalogue"
import { publishedOffers } from "@/lib/managed-offers"
import { requireUser } from "@/lib/managed/server"
import { mcpOrigin } from "./config"
export function registerManagedMcpTools(server: McpServer, token: string, scopes: string[]) {
  function request(path: string, body?: unknown) {
    return new NextRequest(`${mcpOrigin()}${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  async function result(run: () => Promise<unknown>) {
    try { return { content: [{ type: "text" as const, text: JSON.stringify(await run()) }] } }
    catch (error) { return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: error instanceof Error ? error.message : "Could not load your hired project" }) }] } }
  }
  async function payload(response: Response) {
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Managed project request failed")
    return data
  }
  async function project(projectId: string) {
    const data = await payload(await context(request(`/api/managed/projects/${projectId}/chat-context`), { params: Promise.resolve({ projectId }) }))
    return { ...data, projectUrl: `${mcpOrigin()}/hire-us/projects/${projectId}` }
  }
  const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  if (scopes.includes("managed:read")) {
    server.registerTool("managed_list_offers", { description: "Read the current published Hire Our Team services, package keys, prices in INR, video counts and included revisions. Use these exact service and package keys before saving an order brief. Quote-only services require the website enquiry flow.", annotations: read }, () => result(async () => { const { supabase } = await requireUser(request("/api/managed/offers")); return { services: publishedOffers(await loadCatalogue(supabase)) } }))
    server.registerTool("managed_list_projects", { description: "List your own Hire Our Team orders and their production status and delivery dates. These are made on your behalf by the creative team.", annotations: read }, () => result(async () => ({ ...await payload(await list(request("/api/managed/projects"))), hireTeamUrl: `${mcpOrigin()}/hire-us` })))
    server.registerTool("managed_project_status", { description: "See what the team is working on, what is left, the expected delivery date, and recent project chat. An unset date is unconfirmed; do not invent a delivery promise.", inputSchema: { projectId: z.string().uuid() }, annotations: read }, ({ projectId }) => result(async () => project(projectId)))
    server.registerTool("managed_project_delivery", { description: "Show a completed hired project: customer brief, final published videos with viewing links, and project chat. The internal team workspace is private; this tool returns the approved client delivery.", inputSchema: { projectId: z.string().uuid() }, annotations: read }, ({ projectId }) => result(async () => {
      const data = await project(projectId)
      if (!data.fullDeliveryReady) return { ready: false, progress: data.progress, deliverables: data.deliverables, projectUrl: data.projectUrl, message: "The full approved delivery is not ready yet." }
      return { ready: true, ...data }
    }))
  }
  if (scopes.includes("managed:orders")) server.registerTool("managed_create_order_draft", { description: "Save a Hire Our Team brief in your own account and return a secure, sign-in-required checkout link. Use only when the user asks to start an order. First read managed_list_offers and let the user choose the service/package. This does not charge money or start production; the customer reviews and pays on the website. After verified payment the order appears in managed_list_projects. Never claim the draft is paid or promise an unconfirmed delivery date.", inputSchema: orderDraftSchema.shape, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false } }, (input) => result(async () => payload(await createDraft(request("/api/managed/order-drafts", input)))))
  if (scopes.includes("managed:messages")) server.registerTool("managed_project_message", {
    description: "Send a message to the creative team on your own hired project. Use only when the user explicitly asks to send the message. This is a team conversation, not an AI Director generation command.",
    inputSchema: { projectId: z.string().uuid(), message: z.string().trim().min(1).max(8000) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
  }, ({ projectId, message: body }) => result(async () => payload(await message(request(`/api/managed/projects/${projectId}/messages`, { body }), { params: Promise.resolve({ projectId }) }))))
}
