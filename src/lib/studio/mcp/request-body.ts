import { McpOAuthError } from "./config"
export async function boundedBody(request: Request, maxBytes = 16_384) {
  const length = Number(request.headers.get("content-length"))
  if (Number.isFinite(length) && length > maxBytes) throw new McpOAuthError("invalid_request", "Request too large", 413)
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel(); throw new McpOAuthError("invalid_request", "Request too large", 413) }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString("utf8")
  } finally { reader.releaseLock() }
}
