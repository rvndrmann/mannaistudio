#!/usr/bin/env node

const baseUrl = process.env.AI_DIRECTOR_BASE_URL || "http://localhost:3000"
const token = process.env.AI_DIRECTOR_TOKEN

function usage() {
  console.log(`AI Director Hub CLI

Required env:
  AI_DIRECTOR_TOKEN=<token from AI Director Hub>
Optional env:
  AI_DIRECTOR_BASE_URL=http://localhost:3000

Commands:
  projects
  chat <projectId> <episodeId> "<message>" [sessionId]
  tool <projectId> <toolName> '<jsonInput>' [sessionId]
`)
}

async function request(path, options = {}) {
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

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === "help" || command === "--help") {
    usage()
    return
  }

  if (command === "projects") {
    const body = await request("/api/studio/external/projects")
    console.log(JSON.stringify(body, null, 2))
    return
  }

  if (command === "chat") {
    const [projectId, episodeId, message, sessionId] = args
    if (!projectId || !episodeId || !message) throw new Error("Usage: chat <projectId> <episodeId> \"<message>\" [sessionId]")
    const body = await request(`/api/studio/projects/${projectId}/director/chat`, {
      method: "POST",
      body: JSON.stringify({
        episodeId,
        sessionId,
        message,
        idempotencyKey: `cli-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      }),
    })
    console.log(body.assistantMessage?.content || JSON.stringify(body, null, 2))
    return
  }

  if (command === "tool") {
    const [projectId, tool, inputJson = "{}", sessionId] = args
    if (!projectId || !tool) throw new Error("Usage: tool <projectId> <toolName> '<jsonInput>' [sessionId]")
    const body = await request(`/api/studio/projects/${projectId}/director/tools`, {
      method: "POST",
      body: JSON.stringify({
        tool,
        input: JSON.parse(inputJson),
        sessionId,
        idempotencyKey: `cli-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      }),
    })
    console.log(JSON.stringify(body, null, 2))
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
