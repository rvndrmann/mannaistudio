import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  plan: { period: "monthly", interval: 1, item: { currency: "INR", amount: 99900 } },
  subscription: { id: "sub_test", plan_id: "plan_test", status: "active", cancel_at_cycle_end: false, notes: { type: "academy_studio_byok", profile_id: "user", email: "creator@example.com" } },
  row: { id: "sub_test", profile_id: "user", plan_id: "plan_test" }, rpc: vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ error: null })),
}))
vi.mock("razorpay", () => ({ default: class {
  plans = { fetch: vi.fn(async () => mocks.plan) }
  subscriptions = { fetch: vi.fn(async () => mocks.subscription) }
} }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({
  from: () => { const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mocks.row, error: null }) }; return query },
  rpc: mocks.rpc,
}) }))
import { configuredAllAccessPlan, reconcileAllAccess } from "./all-access-server"

beforeEach(() => {
  vi.stubEnv("RAZORPAY_KEY_ID", "key")
  vi.stubEnv("RAZORPAY_KEY_SECRET", "secret")
  vi.stubEnv("RAZORPAY_ALL_ACCESS_PLAN_ID", "plan_test")
  mocks.rpc.mockClear()
  mocks.plan.item.currency = "INR"
  mocks.subscription.notes.profile_id = "user"
})
describe("verified subscription reconciliation", () => {
  it("uses the actual Razorpay price", async () => {
    expect(await configuredAllAccessPlan()).toEqual({ id: "plan_test", amountPaise: 99900, currency: "INR" })
  })
  it("refuses another subscriber's mandate", async () => {
    mocks.subscription.notes.profile_id = "other-user"
    await expect(reconcileAllAccess("sub_test")).rejects.toThrow("ownership")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("activation cannot create a paid period", async () => {
    await reconcileAllAccess("sub_test")
    expect(mocks.rpc).toHaveBeenCalledWith("apply_all_access_subscription_event", expect.objectContaining({ p_payment_id: null, p_paid_until: null }))
  })
  it("rejects incorrect amounts and uncaptured payments before granting access", async () => {
    await expect(reconcileAllAccess("sub_test", { id: "pay", amount: 1, currency: "INR", status: "captured" }, 2000000000)).rejects.toThrow("amount or status")
    await expect(reconcileAllAccess("sub_test", { id: "pay", amount: 99900, currency: "INR", status: "authorized" }, 2000000000)).rejects.toThrow("amount or status")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("records a real charge without invoking a credit or membership grant", async () => {
    await reconcileAllAccess("sub_test", { id: "pay", amount: 99900, currency: "INR", status: "captured" }, 2000000000)
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["apply_all_access_subscription_event", "record_payment"])
  })
})
