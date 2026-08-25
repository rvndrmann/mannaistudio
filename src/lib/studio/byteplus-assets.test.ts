import { beforeEach, describe, expect, it, vi } from "vitest"
import { registerAssetOnce } from "./byteplus-assets"

/**
 * The BytePlus Asset Library holds 50 images for the whole account and every
 * registration burns one permanently. "Verify for Seedance" called the provider
 * unconditionally, so a character that was already verified was registered
 * again on every click — a fresh id for the same face, invisible to the
 * registry and impossible to reclaim.
 */

const createBytePlusAsset = vi.fn()
const getBytePlusAsset = vi.fn()

vi.mock("./byteplus", () => ({
  createBytePlusAsset: (...args: unknown[]) => createBytePlusAsset(...args),
  getBytePlusAsset: (...args: unknown[]) => getBytePlusAsset(...args),
}))

type Row = { id: string; source_path: string; asset_id: string; asset_uri: string; use_count: number }

/** Just enough Supabase to exercise the registry's reads and writes. */
function fakeSupabase(rows: Row[] = []) {
  const table = {
    rows,
    from() {
      let match = ""
      let assetMatch = ""
      let excludedPath = ""
      let pending: "select" | "update" | "delete" | null = null
      let patch: Record<string, unknown> = {}
      const builder = {
        select() { pending = "select"; return builder },
        update(values: Record<string, unknown>) { pending = "update"; patch = values; return builder },
        delete() { pending = "delete"; return builder },
        insert(values: Record<string, unknown>) {
          const mode = (table as unknown as { failInsert?: boolean | string }).failInsert
          if (mode === true) return Promise.resolve({ data: null, error: { code: "42P10", message: "no unique or exclusion constraint matching the ON CONFLICT specification" } })
          if (mode === "conflict") return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value" } })
          rows.push({ id: `row-${rows.length}`, use_count: 1, ...values } as Row)
          return Promise.resolve({ data: null, error: null })
        },
        upsert(values: Record<string, unknown>) {
          const existing = rows.find((row) => row.source_path === values.source_path)
          if (existing) Object.assign(existing, values)
          else rows.push({ id: `row-${rows.length}`, use_count: 1, ...values } as Row)
          return Promise.resolve({ data: null, error: null })
        },
        eq(column: string, value: string) {
          match = value
          if (column === "asset_id") { assetMatch = value; return builder }
          if (pending === "update") {
            const row = rows.find((item) => item.source_path === match || item.id === match)
            if (row) Object.assign(row, patch)
            return Promise.resolve({ data: null, error: null })
          }
          if (pending === "delete") {
            const index = rows.findIndex((item) => item.id === match || item.source_path === match)
            if (index >= 0) rows.splice(index, 1)
            return Promise.resolve({ data: null, error: null })
          }
          return builder
        },
        neq(_column: string, value: string) { excludedPath = value; return builder },
        maybeSingle() {
          if (assetMatch) {
            const claimed = rows.find((row) => row.asset_id === assetMatch && row.source_path !== excludedPath) || null
            return Promise.resolve({ data: claimed, error: null })
          }
          return Promise.resolve({ data: rows.find((row) => row.source_path === match || row.id === match) || null, error: null })
        },
      }
      return builder
    },
  }
  return table as unknown as Parameters<typeof registerAssetOnce>[0]["supabase"] & { rows: Row[] }
}

const active = (assetId: string) => ({ assetId, status: "Active", assetUri: `asset://${assetId}` })

beforeEach(() => {
  createBytePlusAsset.mockReset()
  getBytePlusAsset.mockReset()
})

describe("registerAssetOnce", () => {
  it("registers an image the account has never seen", async () => {
    const supabase = fakeSupabase()
    createBytePlusAsset.mockResolvedValue({ assetId: "asset-new" })
    getBytePlusAsset.mockResolvedValue(active("asset-new"))

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/lena.png",
      imageUrl: "https://signed.example/lena.png?token=one",
    })

    expect(result).toEqual({ assetId: "asset-new", assetUri: "asset://asset-new", reused: false })
    expect(createBytePlusAsset).toHaveBeenCalledTimes(1)
    expect((supabase as unknown as { rows: Row[] }).rows).toHaveLength(1)
  })

  it("reuses the asset the registry already holds for that path", async () => {
    const supabase = fakeSupabase([
      { id: "row-0", source_path: "user/project/lena.png", asset_id: "asset-old", asset_uri: "asset://asset-old", use_count: 3 },
    ])
    getBytePlusAsset.mockResolvedValue(active("asset-old"))

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/lena.png",
      // A different signed URL for the same picture, as every request produces.
      imageUrl: "https://signed.example/lena.png?token=two",
    })

    expect(result).toEqual({ assetId: "asset-old", assetUri: "asset://asset-old", reused: true })
    expect(createBytePlusAsset).not.toHaveBeenCalled()
  })

  it("adopts an id the shot or entity already carries instead of registering again", async () => {
    const supabase = fakeSupabase()
    getBytePlusAsset.mockResolvedValue(active("asset-verified-earlier"))

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/ethan.png",
      imageUrl: "https://signed.example/ethan.png",
      knownAssetId: "asset-verified-earlier",
    })

    expect(result.assetId).toBe("asset-verified-earlier")
    expect(result.reused).toBe(true)
    expect(createBytePlusAsset).not.toHaveBeenCalled()
    // Adopted into the registry: it occupies a slot either way.
    expect((supabase as unknown as { rows: Row[] }).rows[0].asset_id).toBe("asset-verified-earlier")
  })

  it("registers again when the stored id is gone from the provider", async () => {
    const supabase = fakeSupabase([
      { id: "row-0", source_path: "user/project/lena.png", asset_id: "asset-deleted", asset_uri: "asset://asset-deleted", use_count: 1 },
    ])
    getBytePlusAsset.mockImplementation(async (assetId: string) => {
      if (assetId === "asset-deleted") throw new Error("AssetNotFound")
      return active(assetId)
    })
    createBytePlusAsset.mockResolvedValue({ assetId: "asset-fresh" })

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/lena.png",
      imageUrl: "https://signed.example/lena.png",
    })

    expect(result).toEqual({ assetId: "asset-fresh", assetUri: "asset://asset-fresh", reused: false })
    const rows = (supabase as unknown as { rows: Row[] }).rows
    expect(rows).toHaveLength(1)
    expect(rows[0].asset_id).toBe("asset-fresh")
  })

  it("ignores a stored id the provider reports as inactive", async () => {
    const supabase = fakeSupabase()
    getBytePlusAsset.mockImplementation(async (assetId: string) =>
      assetId === "asset-pending" ? { assetId, status: "Processing", assetUri: "" } : active(assetId))
    createBytePlusAsset.mockResolvedValue({ assetId: "asset-fresh" })

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/lena.png",
      imageUrl: "https://signed.example/lena.png",
      knownAssetId: "asset-pending",
    })

    expect(result.assetId).toBe("asset-fresh")
    expect(result.reused).toBe(false)
  })

  it("does not register a second time when the same image is verified twice", async () => {
    const supabase = fakeSupabase()
    createBytePlusAsset.mockResolvedValue({ assetId: "asset-once" })
    getBytePlusAsset.mockResolvedValue(active("asset-once"))

    const first = await registerAssetOnce({ supabase, sourcePath: "user/project/lena.png", imageUrl: "https://signed.example/lena.png?token=a" })
    const second = await registerAssetOnce({ supabase, sourcePath: "user/project/lena.png", imageUrl: "https://signed.example/lena.png?token=b" })

    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
    expect(second.assetId).toBe(first.assetId)
    expect(createBytePlusAsset).toHaveBeenCalledTimes(1)
    expect((supabase as unknown as { rows: Row[] }).rows).toHaveLength(1)
  })
})

describe("a character whose chosen image changed", () => {
  /**
   * The entity keeps pointing at the asset made from its previous picture, so
   * that id arrives here describing an image this one is not. Adopting it
   * registered nothing while reporting success: the new face never reached the
   * Asset Library, the provider kept rejecting it, and the row written against
   * the old asset made every later attempt reuse it too.
   */
  it("registers the new image instead of adopting the old image's asset", async () => {
    const supabase = fakeSupabase([
      { id: "row-0", source_path: "user/project/ethan-old.png", asset_id: "asset-old", asset_uri: "asset://asset-old", use_count: 1 },
    ])
    createBytePlusAsset.mockResolvedValue({ assetId: "asset-fresh" })
    getBytePlusAsset.mockResolvedValue(active("asset-fresh"))

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/ethan-new.png",
      imageUrl: "https://signed.example/ethan-new.png?token=one",
      knownAssetId: "asset-old",
    })

    expect(result.reused).toBe(false)
    expect(result.assetId).toBe("asset-fresh")
    expect(createBytePlusAsset).toHaveBeenCalledTimes(1)
    const rows = (supabase as unknown as { rows: Row[] }).rows
    expect(rows.find((row) => row.source_path === "user/project/ethan-new.png")?.asset_id).toBe("asset-fresh")
    // The old image keeps its own registration; nothing is taken from it.
    expect(rows.find((row) => row.source_path === "user/project/ethan-old.png")?.asset_id).toBe("asset-old")
  })

  it("still adopts an id that no other image has claimed", async () => {
    const supabase = fakeSupabase()
    getBytePlusAsset.mockResolvedValue(active("asset-predates-registry"))

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/lena.png",
      imageUrl: "https://signed.example/lena.png?token=one",
      knownAssetId: "asset-predates-registry",
    })

    expect(result.reused).toBe(true)
    expect(createBytePlusAsset).not.toHaveBeenCalled()
  })
})

describe("recording a registration", () => {
  /**
   * The write used ON CONFLICT ("source_path") against an index that is on
   * (source_path, coalesce(credential_id, ...)). Postgres rejects a conflict
   * target matching no constraint, and nothing looked at the result — so every
   * registration was forgotten, the same face was registered again on the next
   * generation, and the fifty-image library filled with duplicates while
   * verified characters were still rejected.
   */
  it("fails loudly when the row cannot be written", async () => {
    const supabase = fakeSupabase()
    ;(supabase as unknown as { failInsert: boolean }).failInsert = true
    createBytePlusAsset.mockResolvedValue({ assetId: "asset-new" })
    getBytePlusAsset.mockResolvedValue(active("asset-new"))

    await expect(registerAssetOnce({
      supabase,
      sourcePath: "user/project/lena.png",
      imageUrl: "https://signed.example/lena.png?token=one",
    })).rejects.toThrow(/could not record it/i)
  })

  it("keeps the row when a racing registration got there first", async () => {
    const supabase = fakeSupabase()
    ;(supabase as unknown as { failInsert: "conflict" }).failInsert = "conflict"
    createBytePlusAsset.mockResolvedValue({ assetId: "asset-new" })
    getBytePlusAsset.mockResolvedValue(active("asset-new"))

    const result = await registerAssetOnce({
      supabase,
      sourcePath: "user/project/lena.png",
      imageUrl: "https://signed.example/lena.png?token=one",
    })
    expect(result.assetId).toBe("asset-new")
  })
})
