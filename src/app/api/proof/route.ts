import { NextRequest, NextResponse } from "next/server"
import { createPublicClient, fetchPublishedProof, isProofType } from "@/lib/proof"

export const dynamic = "force-dynamic"

/**
 * Published proof, for anyone.
 *
 * GET /api/proof?type=portfolio|student_review|sale_proof&featured=true&limit=6
 *
 * Read without a session, so the caller being an admin changes nothing: drafts,
 * soft-deleted rows and anything without consent on record are not reachable
 * from here whoever asks.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const type = params.get("type")
  if (type && !isProofType(type)) {
    return NextResponse.json({ error: "Unknown type" }, { status: 400 })
  }
  const featured = params.get("featured")
  const limit = Number(params.get("limit"))

  const items = await fetchPublishedProof(createPublicClient(), {
    type: type && isProofType(type) ? type : undefined,
    featured: featured === "true" ? true : featured === "false" ? false : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined,
  })

  // The public shape leaves out the admin's bookkeeping: every row here is
  // published and consented by construction, so saying so is noise.
  const body = items.map(({ consentConfirmed: _consent, published: _published, ...item }) => item)
  return NextResponse.json({ items: body }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  })
}
