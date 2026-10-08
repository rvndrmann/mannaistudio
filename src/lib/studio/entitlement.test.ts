import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getCreatorStudioAccess } from "./entitlement"

describe("public Studio workspace access", () => {
  const client = { from: () => { throw new Error("No invitation or subscription lookup should be needed") } } as unknown as SupabaseClient
  it("opens the workspace to a user without any invitation or subscription", async () => {
    expect(await getCreatorStudioAccess(client, "ordinary-user")).toEqual({ entitled: true, purchaseOnly: false, purchaseWindowExpiresAt: null })
  })
  it("does not grant anonymous access", async () => {
    expect((await getCreatorStudioAccess(client, "")).entitled).toBe(false)
  })
})
