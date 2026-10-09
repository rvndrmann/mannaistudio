import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ admin: false, error: null as unknown, active: false, required: true }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (table: string) => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "admin_users" && state.admin ? { id: "user" } : null, error: state.error }) }
  return query
} }) }))
vi.mock("./subscription-policy", () => ({ getByokSubscriptionPolicy: async () => ({ required: state.required, active: state.active }) }))
import { hasByokSubscription } from "./credential-service"
beforeEach(() => { state.admin = false; state.error = null; state.active = false; state.required = true })
it("allows admins without a subscription, including an expired one", async () => {
  state.admin = true
  expect(await hasByokSubscription("user")).toBe(true)
})
it("denies regular users with an expired subscription", async () => {
  expect(await hasByokSubscription("user")).toBe(false)
})
it("allows regular users with an active subscription", async () => {
  state.active = true
  expect(await hasByokSubscription("user")).toBe(true)
})
it("fails closed if admin verification fails", async () => {
  state.error = new Error("Unavailable")
  await expect(hasByokSubscription("user")).rejects.toThrow("Unavailable")
})
