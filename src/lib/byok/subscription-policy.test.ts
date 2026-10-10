import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ rows: [] as { paid_until: string | null }[], error: null as unknown, preferences: {} as Record<string, unknown>, creditsEnabled: true, testUserIds: [] as string[] }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (table: string) => {
  let key = ""
  const query = { select: () => query, eq: (_column: string, value: string) => { key = value; return query }, not: async () => ({ data: mocks.rows, error: mocks.error }),
    maybeSingle: async () => ({ data: table === "site_settings" ? { value: key === "byok_test_access" ? { userIds: mocks.testUserIds } : { enabled: mocks.creditsEnabled } } : { preferences: mocks.preferences }, error: mocks.error }), upsert: vi.fn() }
  return query
} }) }))
import { getByokSubscriptionPolicy } from "./subscription-policy"
import { ownKeysOnly, setOwnKeysOnly } from "./preferences"

describe("mandatory subscription billing policy", () => {
  beforeEach(() => { mocks.rows = []; mocks.error = null; mocks.preferences = {}; mocks.creditsEnabled = true; mocks.testUserIds = [] })
  it("requires own keys even if the user preference is false", async () => {
    mocks.rows = [{ paid_until: new Date(Date.now() + 60_000).toISOString() }]
    mocks.preferences = { byok_own_keys_only: false }
    expect(await getByokSubscriptionPolicy("user")).toEqual({ required: true, active: true })
    expect(await ownKeysOnly("user")).toBe(true)
    await expect(setOwnKeysOnly("user", false)).rejects.toThrow("requires your own")
  })
  it("expired subscriptions cannot use keys or switch old jobs to the platform", async () => {
    mocks.rows = [{ paid_until: new Date(Date.now() - 60_000).toISOString() }]
    expect(await getByokSubscriptionPolicy("user")).toEqual({ required: true, active: false })
    expect(await ownKeysOnly("user")).toBe(true)
  })
  it("retains existing account preferences when there is no BYOK subscription", async () => {
    expect(await ownKeysOnly("user")).toBe(false)
    mocks.preferences = { byok_own_keys_only: true }
    expect(await ownKeysOnly("user")).toBe(true)
  })
  it("forces own keys for users with platform credits disabled", async () => {
    mocks.creditsEnabled = false
    expect(await ownKeysOnly("user")).toBe(true)
    await expect(setOwnKeysOnly("user", false)).rejects.toThrow("requires your own")
  })
  it("allows an explicitly granted BYOK tester and locks them to their own keys", async () => {
    mocks.testUserIds = ["user"]
    mocks.preferences = { byok_own_keys_only: false }
    expect(await getByokSubscriptionPolicy("user")).toEqual({ required: true, active: true })
    expect(await ownKeysOnly("user")).toBe(true)
    await expect(setOwnKeysOnly("user", false)).rejects.toThrow("requires your own")
    expect(await getByokSubscriptionPolicy("other")).toEqual({ required: false, active: false })
  })
  it("database failures cannot authorize spending platform credits", async () => {
    mocks.error = new Error("Database unavailable")
    await expect(ownKeysOnly("user")).rejects.toThrow("Database unavailable")
  })
})
