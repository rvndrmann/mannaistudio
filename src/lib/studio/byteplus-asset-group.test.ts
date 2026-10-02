import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * An asset group that disappears from the account.
 *
 * The id lives in process memory between registrations, so when the group is
 * deleted in the Ark console — or was created on a different account entirely —
 * every registration afterwards asked for a group that no longer exists. That
 * failure is not confined to "Verify for Seedance": a face that cannot be
 * registered is sent to Seedance as a plain URL, which refuses it as possibly
 * showing a real person. The cause and the symptom name nothing in common, so
 * the studio reported a rejected character while the actual fault was a dead
 * group id it kept reaching for until the process recycled.
 */

const DEAD_GROUP = "group-20260912093747-gone"

type Call = { action: string; body: Record<string, unknown> }

const result = (payload: unknown) =>
  new Response(JSON.stringify({ ResponseMetadata: {}, Result: payload }), { status: 200 })

const notFound = (message: string) =>
  new Response(JSON.stringify({ ResponseMetadata: { Error: { Code: "NotFound.group_id", Message: message } } }), { status: 404 })

function arkStub(calls: Call[], options: { liveGroups?: string[] } = {}) {
  return async (url: string, init: RequestInit) => {
    const action = new URL(url).searchParams.get("Action") || ""
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    calls.push({ action, body })
    if (action === "CreateAsset") {
      return body.GroupId === DEAD_GROUP
        ? notFound(`The specified asset_group ${DEAD_GROUP} is not found.`)
        : result({ Id: `asset-in-${body.GroupId}` })
    }
    if (action === "ListAssetGroups") {
      const items = (options.liveGroups || []).map((id) => ({ Id: id, Name: "aidirector_character_references", CreateTime: "2026-09-01" }))
      return result({ TotalCount: items.length, Items: items })
    }
    if (action === "CreateAssetGroup") return result({ Id: "group-live" })
    throw new Error(`Unexpected BytePlus action: ${action}`)
  }
}

/** A fresh module, because the group id it remembers is module state. */
async function freshProvider() {
  vi.resetModules()
  return import("./byteplus")
}

beforeEach(() => {
  vi.stubEnv("ARK_ACCESS_KEY", "test-access-key")
  vi.stubEnv("ARK_SECRET_KEY", "test-secret-key")
  vi.stubEnv("ARK_ASSET_GROUP_ID", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("registering into a group the account no longer has", () => {
  it("replaces the dead group and registers the image anyway", async () => {
    const calls: Call[] = []
    vi.stubGlobal("fetch", arkStub(calls))
    const { createBytePlusAsset } = await freshProvider()

    const created = await createBytePlusAsset({ imageUrl: "https://signed.example/maya.png", groupId: DEAD_GROUP })

    expect(created).toEqual({ assetId: "asset-in-group-live", groupId: "group-live", shared: true })
    // The caller stores what came back, so the dead id is retired rather than
    // handed to the next registration.
    expect(calls.filter((call) => call.action === "CreateAsset").map((call) => call.body.GroupId))
      .toEqual([DEAD_GROUP, "group-live"])
  })

  it("prefers a group the account already has over making another one", async () => {
    const calls: Call[] = []
    vi.stubGlobal("fetch", arkStub(calls, { liveGroups: ["group-existing"] }))
    const { createBytePlusAsset } = await freshProvider()

    const created = await createBytePlusAsset({ imageUrl: "https://signed.example/maya.png", groupId: DEAD_GROUP })

    expect(created.groupId).toBe("group-existing")
    expect(calls.some((call) => call.action === "CreateAssetGroup")).toBe(false)
  })

  it("stops reaching for the dead group on every later registration", async () => {
    const calls: Call[] = []
    vi.stubGlobal("fetch", arkStub(calls))
    const { createBytePlusAsset } = await freshProvider()

    // The first registration is the one that discovers the group is gone; the
    // second is every render after it, which used to fail identically because
    // the same dead id was still what the process remembered.
    await createBytePlusAsset({ imageUrl: "https://signed.example/maya.png", groupId: DEAD_GROUP })
    const second = await createBytePlusAsset({ imageUrl: "https://signed.example/ethan.png" })

    expect(second.assetId).toBe("asset-in-group-live")
    expect(calls.filter((call) => call.action === "CreateAssetGroup")).toHaveLength(1)
    expect(calls.filter((call) => call.action === "CreateAsset").map((call) => call.body.GroupId))
      .toEqual([DEAD_GROUP, "group-live", "group-live"])
  })

  it("leaves a group the operator named alone, and says what the provider said", async () => {
    const calls: Call[] = []
    vi.stubEnv("ARK_ASSET_GROUP_ID", DEAD_GROUP)
    vi.stubGlobal("fetch", arkStub(calls))
    const { createBytePlusAsset } = await freshProvider()

    // Pointing at a specific group is a deliberate setting: silently writing
    // the studio's own group over it would hide a misconfiguration nobody
    // could then see.
    await expect(createBytePlusAsset({ imageUrl: "https://signed.example/maya.png" }))
      .rejects.toThrow(/asset_group .* is not found/i)
    expect(calls.some((call) => call.action === "CreateAssetGroup")).toBe(false)
  })
})
