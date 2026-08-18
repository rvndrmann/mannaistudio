import { NextRequest, NextResponse } from "next/server"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { readBrandWebsite } from "@/lib/studio/brand-website"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

// Up to five pages, each with its own fetch timeout.
export const maxDuration = 60

/**
 * Reads the brand's website and stores what it says.
 *
 * The result is saved even when the read fails, so the panel can say why rather
 * than looking like nothing happened, and so a broken site is not retried on
 * every agent turn.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const website = typeof context.brand.website_url === "string" ? context.brand.website_url.trim() : ""
    if (!website) {
      return NextResponse.json({ error: "Add the brand's website address first." }, { status: 400 })
    }

    const result = await readBrandWebsite(website)
    const { data, error } = await context.supabase
      .from("creator_brands")
      .update({
        website_snapshot: result.snapshot,
        website_pages: result.pages.map((page) => ({ url: page.url, title: page.title })),
        website_fetched_at: new Date().toISOString(),
        website_error: result.error,
      })
      .eq("id", brandId)
      .select("*")
      .single()
    if (error) throw error

    return NextResponse.json({ brand: data, pagesRead: result.pages.length, error: result.error })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not read the website") }, { status: studioErrorStatus(error) })
  }
}
