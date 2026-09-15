/**
 * The showcase reel: the admin's pick of work, shown on the homepage.
 *
 * `showcase_items` has curated the homepage since the first week and this does
 * not replace it — it names the shape the rows come back in, and the order a
 * reel plays them. The category, brand, position and featured flag are all
 * optional: a row saved before they existed sorts and renders exactly as it
 * always did.
 */

export type ShowcaseVideo = {
  id: string
  title: string
  description: string
  thumbnail: string
  videoUrl: string
  category: string
  brand: string
  position: number
  isFeatured: boolean
  createdAt: string
}

/**
 * The formats an admin can tag a video with.
 *
 * A list in the app rather than a constraint in the database, so adding one is
 * a deploy and not a migration — and an old row carrying a category no longer
 * on this list still renders, it just stops matching a filter.
 */
export const showcaseCategories = [
  { key: "ugc", label: "UGC" },
  { key: "product", label: "Product Ads" },
  { key: "direct_response", label: "Direct Response" },
  { key: "cinematic", label: "Cinematic" },
  { key: "dtc", label: "DTC" },
  { key: "beauty", label: "Beauty" },
  { key: "fashion", label: "Fashion" },
  { key: "food", label: "Food & Beverage" },
  { key: "real_estate", label: "Real Estate" },
  { key: "other", label: "Other" },
] as const

export type ShowcaseCategory = (typeof showcaseCategories)[number]["key"]

export function showcaseCategoryLabel(key: string): string {
  return showcaseCategories.find((category) => category.key === key)?.label || "Other"
}

/** A row from `showcase_items`, in the shape the page wants. */
export function toShowcaseVideo(row: Record<string, unknown>): ShowcaseVideo {
  return {
    id: String(row.id || ""),
    title: typeof row.title === "string" ? row.title : "",
    description: typeof row.description === "string" ? row.description : "",
    thumbnail: typeof row.thumbnail === "string" ? row.thumbnail : "",
    videoUrl: typeof row.video_url === "string" ? row.video_url : "",
    category: typeof row.category === "string" && row.category ? row.category : "other",
    brand: typeof row.brand === "string" ? row.brand : "",
    position: typeof row.position === "number" ? row.position : 0,
    isFeatured: row.is_featured === true,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  }
}

/**
 * Featured first, then the admin's order, then newest.
 *
 * The last of those three is the whole of the old behaviour, so a library where
 * nobody has touched a position or a star plays in exactly the order it used to.
 */
export function sortShowcase(videos: ShowcaseVideo[]): ShowcaseVideo[] {
  return [...videos].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
    if (a.position !== b.position) return a.position - b.position
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** The filter row: only categories that actually have a video behind them. */
export function availableShowcaseFilters(videos: ShowcaseVideo[]) {
  const present = new Set(videos.map((video) => video.category))
  return showcaseCategories.filter((category) => present.has(category.key))
}
