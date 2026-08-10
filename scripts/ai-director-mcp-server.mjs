#!/usr/bin/env node

const baseUrl = process.env.AI_DIRECTOR_BASE_URL || "http://localhost:3000"
const token = process.env.AI_DIRECTOR_TOKEN
let buffer = Buffer.alloc(0)

const tools = [
  {
    name: "list_projects",
    description: "List AI Director Hub projects and their default episode/session IDs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "director_chat",
    description: "Send a message to the AI Director agent for a project episode.",
    inputSchema: {
      type: "object",
      required: ["projectId", "episodeId", "message"],
      properties: {
        projectId: { type: "string" },
        episodeId: { type: "string" },
        sessionId: { type: "string" },
        message: { type: "string" },
        model: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "director_tool",
    description: "Execute or propose an AI Director tool such as inspect_current_project or update_script.",
    inputSchema: {
      type: "object",
      required: ["projectId", "tool", "input"],
      properties: {
        projectId: { type: "string" },
        sessionId: { type: "string" },
        tool: { type: "string" },
        input: { type: "object" },
      },
      additionalProperties: false,
    },
  },
]

async function api(path, options = {}) {
  if (!token) throw new Error("Missing AI_DIRECTOR_TOKEN")
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`)
  return body
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message))
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return { content: [{ type: "text", text }] }
}

async function handle(message) {
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ai-director-hub", version: "1.0.0" },
      },
    })
    return
  }

  if (message.method === "notifications/initialized") return

  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools } })
    return
  }

  if (message.method === "tools/call") {
    try {
      const name = message.params?.name
      const args = message.params?.arguments || {}
      if (name === "list_projects") {
        send({ jsonrpc: "2.0", id: message.id, result: textResult(await api("/api/studio/external/projects")) })
        return
      }
      if (name === "director_chat") {
        const body = await api(`/api/studio/projects/${args.projectId}/director/chat`, {
          method: "POST",
          body: JSON.stringify({
            episodeId: args.episodeId,
            sessionId: args.sessionId,
            message: args.message,
            model: args.model,
            idempotencyKey: `mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          }),
        })
        send({ jsonrpc: "2.0", id: message.id, result: textResult(body.assistantMessage?.content || body) })
        return
      }
      if (name === "director_tool") {
        const body = await api(`/api/studio/projects/${args.projectId}/director/tools`, {
          method: "POST",
          body: JSON.stringify({
            tool: args.tool,
            input: args.input || {},
            sessionId: args.sessionId,
            idempotencyKey: `mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          }),
        })
        send({ jsonrpc: "2.0", id: message.id, result: textResult(body) })
        return
      }
      throw new Error(`Unknown tool: ${name}`)
    } catch (error) {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error instanceof Error ? error.message : "Tool call failed" } })
    }
    return
  }

  if (message.id) {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Unknown method: ${message.method}` } })
  }
}

function processBuffer() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n")
    if (headerEnd === -1) return
    const header = buffer.subarray(0, headerEnd).toString()
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) throw new Error("Missing Content-Length header")
    const length = Number(match[1])
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + length
    if (buffer.length < bodyEnd) return
    const body = buffer.subarray(bodyStart, bodyEnd).toString()
    buffer = buffer.subarray(bodyEnd)
    handle(JSON.parse(body)).catch((error) => {
      send({ jsonrpc: "2.0", error: { code: -32000, message: error instanceof Error ? error.message : "MCP server failed" } })
    })
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  processBuffer()
})
