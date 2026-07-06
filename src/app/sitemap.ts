import type { MetadataRoute } from "next"
import { getPublishedSlugs } from "@/lib/blog"

const BASE_URL = "https://www.aidirectorhub.com"

// Revalidate the sitemap so newly published posts show up without a redeploy.
export const revalidate = 600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const routes = [
        "",            // home
        "/courses",
        "/blog",
        "/billing",
        "/about",
        "/contact",
        "/terms",
        "/privacy",
        "/refund",
        // Omitted on purpose:
        //   /login — low-value auth page
        //   /challenges, /services — paused features (re-add when relaunched)
    ]

    const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
        url: `${BASE_URL}${route}`,
        lastModified: new Date(),
        changeFrequency: route === "" ? "daily" : "weekly",
        priority: route === "" ? 1 : 0.7,
    }))

    const posts = await getPublishedSlugs()
    const blogEntries: MetadataRoute.Sitemap = posts.map((p) => ({
        url: `${BASE_URL}/blog/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
    }))

    return [...staticEntries, ...blogEntries]
}
