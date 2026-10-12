import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ features: vi.fn(), admin: vi.fn() }))
vi.mock("@/lib/studio/feature-flags", () => ({ fetchSiteFeatures: mocks.features }))
vi.mock("@/lib/membership", () => ({ isAdminUser: mocks.admin }))

import { mcpOpenFor } from "./access"

const supabase = {} as never

describe("mcpOpenFor", () => {
  beforeEach(() => { mocks.features.mockReset(); mocks.admin.mockReset() })

  it("is open to everyone while the feature is live, without asking who they are", async () => {
    mocks.features.mockResolvedValue({ mcp: true })
    expect(await mcpOpenFor(supabase, "user")).toBe(true)
    expect(mocks.admin).not.toHaveBeenCalled()
  })

  it("is closed to a customer while paused", async () => {
    mocks.features.mockResolvedValue({ mcp: false }); mocks.admin.mockResolvedValue(false)
    expect(await mcpOpenFor(supabase, "user")).toBe(false)
  })

  it("stays open to an admin while paused", async () => {
    mocks.features.mockResolvedValue({ mcp: false }); mocks.admin.mockResolvedValue(true)
    expect(await mcpOpenFor(supabase, "admin")).toBe(true)
  })

  it("fails closed when the admin lookup errors", async () => {
    mocks.features.mockResolvedValue({ mcp: false }); mocks.admin.mockRejectedValue(new Error("down"))
    expect(await mcpOpenFor(supabase, "user")).toBe(false)
  })
})
