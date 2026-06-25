import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // Keep private/app-only routes out of search results.
            disallow: ["/admin", "/api", "/profile", "/messages", "/feed"],
        },
        sitemap: "https://www.aidirectorhub.com/sitemap.xml",
    }
}
