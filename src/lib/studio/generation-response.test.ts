import { describe, expect, it } from "vitest"
import { readGenerationResponse } from "./generation-response"

describe("readGenerationResponse", () => {
  it("returns the route's own JSON unchanged", async () => {
    const body = await readGenerationResponse(new Response(JSON.stringify({ jobId: "job-1", path: "a/b.png" }), { status: 200 }))
    expect(body.jobId).toBe("job-1")
    expect(body.path).toBe("a/b.png")
  })

  it("keeps the route's error message when the route is the one refusing", async () => {
    const response = new Response(JSON.stringify({ error: "Insufficient credits" }), { status: 402 })
    await expect(readGenerationResponse(response)).resolves.toEqual({ error: "Insufficient credits" })
  })

  // The failure this exists for: the function is killed mid-render and the host
  // answers the browser with its own error page. Parsing that as JSON put the
  // parser's complaint on screen as the reason the picture failed.
  it("explains a host error page instead of reporting a JSON syntax error", async () => {
    const hostPage = "<HTML>\n<HEAD><TITLE>502 Bad Gateway</TITLE></HEAD>\n<BODY></BODY>\n</HTML>"
    const error = await readGenerationResponse(new Response(hostPage, { status: 502 })).catch((thrown: Error) => thrown)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toMatch(/Unexpected token|valid JSON/)
    expect((error as Error).message).toContain("502")
    expect((error as Error).message).toMatch(/credits returned/)
  })

  it("treats a body with nothing in it as an answer that never arrived", async () => {
    const error = await readGenerationResponse(new Response("", { status: 504 })).catch((thrown: Error) => thrown)
    expect((error as Error).message).toContain("504")
  })

  it("reports a non-JSON 4xx without promising a refund it cannot make", async () => {
    const error = await readGenerationResponse(new Response("<html>nope</html>", { status: 413 })).catch((thrown: Error) => thrown)
    expect((error as Error).message).toContain("413")
    expect((error as Error).message).not.toMatch(/credits/)
  })
})
