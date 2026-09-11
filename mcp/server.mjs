#!/usr/bin/env node
/**
 * An MCP server for the AI Director studio, spoken over stdio.
 *
 * No SDK: the stdio transport is newline-delimited JSON-RPC, and the three
 * methods a tool server must answer fit in this file. A dependency here would
 * be installed into the Next app and shipped to the Netlify build for the sake
 * of a message loop, which is not a trade worth making.
 */

import { createInterface } from "node:readline"
import { tools, toolsByName } from "./tools.mjs"
import { baseUrl } from "./studio-client.mjs"

const PROTOCOL_VERSION = "2024-11-05"

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result })
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } })
}

async function handle(request) {
  const { id, method, params } = request

  if (method === "initialize") {
    return respond(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ai-director-studio", version: "1.0.0" },
      instructions:
        `Controls the AI Director studio at ${baseUrl()}. Read state with studio_list_projects, ` +
        `studio_storyboard and studio_pending_work. Act through studio_chat (conversational) or ` +
        `studio_run_director_tool (precise). Anything that spends credits returns a proposal — show ` +
        `the user its cost and approve it only on their say-so, via studio_decide_proposal.`,
    })
  }

  // Notifications carry no id and must not be answered.
  if (method === "notifications/initialized" || method?.startsWith("notifications/")) return
  if (method === "ping") return respond(id, {})

  if (method === "tools/list") {
    return respond(id, {
      tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    })
  }

  if (method === "tools/call") {
    const tool = toolsByName.get(params?.name)
    if (!tool) return fail(id, -32602, `Unknown tool: ${params?.name}`)
    try {
      return respond(id, await tool.run(params.arguments || {}))
    } catch (error) {
      // Reported as a result rather than a protocol error: the model should see
      // what went wrong and correct its arguments, not have the call vanish.
      return respond(id, {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      })
    }
  }

  if (id !== undefined) fail(id, -32601, `Method not found: ${method}`)
}

// A generation request runs for minutes, and stdin can close before it
// answers — a piped test does exactly that. Exiting on close alone dropped the
// reply, so the count of calls still in flight decides when there is nothing
// left to serve.
let inFlight = 0
let clientGone = false

function maybeExit() {
  if (clientGone && inFlight === 0) process.exit(0)
}

const input = createInterface({ input: process.stdin })
input.on("line", (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let request
  try {
    request = JSON.parse(trimmed)
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
  }
  inFlight += 1
  handle(request)
    .catch((error) => {
      if (request.id !== undefined) fail(request.id, -32603, error?.message || "Internal error")
    })
    .finally(() => {
      inFlight -= 1
      maybeExit()
    })
})

input.on("close", () => {
  clientGone = true
  maybeExit()
})
