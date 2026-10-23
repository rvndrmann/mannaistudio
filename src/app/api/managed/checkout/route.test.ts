import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { buildCatalogue } from "@/lib/managed-offers"
import { emptyManagedBrief } from "@/lib/managed-brief"
import { POST } from "./route"

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), ordersCreate: vi.fn(), loadCatalogue: vi.fn(), serviceOpen: vi.fn(),
}))

vi.mock("@/lib/managed/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/managed/server")>()),
  requireUser: async () => ({ supabase: {}, user: { id: "buyer-1", email: "buyer@example.test", user_metadata: {} } }),
  ensureProfile: async () => undefined,
  managedServiceOpen: mocks.serviceOpen,
}))
vi.mock("@/lib/managed/catalogue", () => ({ loadCatalogue: mocks.loadCatalogue }))
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    storage: { from: () => ({ copy: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  }),
}))
vi.mock("razorpay", () => ({
  default: class { orders = { create: mocks.ordersCreate } },
}))

const catalogue = buildCatalogue(
  [{
    id: "11111111-1111-1111-1111-111111111111", key: "ugc", name: "UGC Ads", tagline: "", description: "",
    cta: "", thumbnail_url: "", video_url: "", deliverables: [], styles: [], quote_only: false, is_published: true, position: 1,
  }],
  [{
    id: "aaaaaaaa-0000-0000-0000-000000000001", service_id: "11111111-1111-1111-1111-111111111111", key: "ugc_pack",
    name: "UGC Ad Pack", summary: "", video_count: 3, duration_seconds: 60, revisions: 2, price_inr: 26_000,
    includes: [], popular: true, is_published: true, position: 1, slot_limit: 2, queue_limit: 5,
  }],
)

const checkout = (body: Record<string, unknown>) => POST(new NextRequest("http://localhost/api/managed/checkout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ serviceType: "ugc", packageKey: "ugc_pack", brief: emptyManagedBrief(), ...body }),
}))

beforeEach(() => {
  vi.resetAllMocks()
  process.env.RAZORPAY_KEY_ID = "rzp_test_key"
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret"
  mocks.loadCatalogue.mockResolvedValue(catalogue)
  mocks.serviceOpen.mockResolvedValue(true)
  mocks.ordersCreate.mockResolvedValue({ id: "order_1" })
})

describe("managed checkout capacity", () => {
  it("asks the database to place the order, without consent to queue by default", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "project-1", queue_state: "slot" }, error: null })
    const response = await checkout({})
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("create_managed_project", expect.objectContaining({
      p_package_key: "ugc_pack", p_price_inr: 26_000, p_allow_queue: false,
    }))
    expect((await response.json()).queued).toBe(false)
  })

  it("passes the buyer's consent to wait, and marks the order a queue booking", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "project-1", queue_state: "queued" }, error: null })
    const response = await checkout({ joinQueue: true })
    expect(mocks.rpc).toHaveBeenCalledWith("create_managed_project", expect.objectContaining({ p_allow_queue: true }))
    expect((await response.json()).queued).toBe(true)
    expect(mocks.ordersCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 26_000 * 100,
      notes: expect.objectContaining({ managed_project_id: "project-1", queue: "yes" }),
    }))
  })

  it("answers 409 slots_full and opens no payment when the last slot has gone", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "managed_slots_full" } })
    const response = await checkout({})
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe("slots_full")
    expect(mocks.ordersCreate).not.toHaveBeenCalled()
  })

  it("answers 409 sold_out when the queue is full too", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "managed_sold_out" } })
    const response = await checkout({ joinQueue: true })
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe("sold_out")
    expect(mocks.ordersCreate).not.toHaveBeenCalled()
  })

  it("refuses a body that tries to tell it a count or a price", async () => {
    expect((await checkout({ slotsTaken: 0 })).status).toBe(400)
    expect((await checkout({ priceInr: 1 })).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
