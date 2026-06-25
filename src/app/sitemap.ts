import type { MetadataRoute } from "next"

const BASE_URL = "https://www.aidirectorhub.com"

export default function sitemap(): MetadataRoute.Sitemap {
    const routes = [
        "",            // home
        "/courses",
        "/challenges",
        "/services",   // AI Jobs
        "/billing",
        "/about",
        "/contact",
        "/terms",
        "/privacy",
        "/refund",
        "/login",
    ]

    return routes.map((route) => ({
        url: `${BASE_URL}${route}`,
        lastModified: new Date(),
        changeFrequency: route === "" ? "daily" : "weekly",
        priority: route === "" ? 1 : 0.7,
    }))
}
