import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { getPublishedPost, getPublishedSlugs, type BlogMedia } from "@/lib/blog"

export const revalidate = 600

const BASE_URL = "https://www.aidirectorhub.com"

export async function generateStaticParams() {
    const slugs = await getPublishedSlugs()
    return slugs.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>
}): Promise<Metadata> {
    const { slug } = await params
    const post = await getPublishedPost(slug)
    if (!post) return { title: "Article not found | AI Director Hub" }

    const url = `${BASE_URL}/blog/${post.slug}`
    const description = post.meta_description || post.excerpt
    const keywords = post.keywords
        ? post.keywords.split(",").map((k) => k.trim()).filter(Boolean)
        : undefined
    const images = post.cover_image ? [post.cover_image] : undefined

    return {
        title: `${post.title} | AI Director Hub`,
        description,
        keywords,
        alternates: { canonical: url },
        openGraph: {
            title: post.title,
            description,
            url,
            type: "article",
            publishedTime: post.published_at ?? undefined,
            images,
        },
        twitter: {
            card: "summary_large_image",
            title: post.title,
            description,
            images,
        },
    }
}

function MediaBlock({ media }: { media: BlogMedia }) {
    return (
        <figure className="my-8 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
            {media.type === "video" ? (
                <video
                    src={media.url}
                    poster={media.poster}
                    controls
                    preload="none"
                    playsInline
                    className="w-full bg-black"
                />
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={media.url}
                    alt={media.caption || media.prompt || "AI generated example"}
                    loading="lazy"
                    decoding="async"
                    className="w-full"
                />
            )}
            {(media.caption || media.prompt || media.model) && (
                <figcaption className="p-4 text-sm text-white/50 space-y-1">
                    {media.caption && (
                        <p className="text-white/70 font-medium">{media.caption}</p>
                    )}
                    {media.prompt && (
                        <p>
                            <span className="text-primary font-semibold">Prompt:</span>{" "}
                            {media.prompt}
                        </p>
                    )}
                    {media.model && (
                        <p>
                            <span className="text-primary font-semibold">Model:</span>{" "}
                            {media.model}
                        </p>
                    )}
                </figcaption>
            )}
        </figure>
    )
}

export default async function BlogPostPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const post = await getPublishedPost(slug)
    if (!post) notFound()

    const url = `${BASE_URL}/blog/${post.slug}`

    // Structured data: Article + a VideoObject per embedded video example.
    const jsonLd: Record<string, unknown>[] = [
        {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.meta_description || post.excerpt,
            image: post.cover_image ? [post.cover_image] : undefined,
            datePublished: post.published_at,
            dateModified: post.updated_at,
            author: { "@type": "Organization", name: post.author || "AI Director Hub" },
            publisher: {
                "@type": "Organization",
                name: "AI Director Hub",
                logo: { "@type": "ImageObject", url: `${BASE_URL}/favicon.png` },
            },
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
        },
        ...post.media
            .filter((m) => m.type === "video")
            .map((m) => ({
                "@context": "https://schema.org",
                "@type": "VideoObject",
                name: m.caption || post.title,
                description: m.prompt || post.excerpt,
                thumbnailUrl: m.poster ? [m.poster] : undefined,
                contentUrl: m.url,
                uploadDate: post.published_at,
            })),
    ]

    return (
        <main className="min-h-screen">
            <Navbar />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <article className="pt-32 pb-20 px-6 max-w-3xl mx-auto">
                <Link
                    href="/blog"
                    className="text-sm text-white/40 hover:text-primary transition-colors"
                >
                    ← Back to blog
                </Link>

                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-6 mb-4">
                    {post.title}
                </h1>
                {post.published_at && (
                    <p className="text-sm text-white/40 mb-8">
                        {new Date(post.published_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                        })}{" "}
                        · {post.author || "AI Director Hub"}
                    </p>
                )}

                {post.cover_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={post.cover_image}
                        alt={post.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full rounded-2xl border border-white/10 mb-10"
                    />
                )}

                {/* Body — admin-reviewed HTML authored by the AI writer. */}
                <div
                    className="blog-prose"
                    dangerouslySetInnerHTML={{ __html: post.content }}
                />

                {/* Real AI-generated examples used in this article. */}
                {post.media.length > 0 && (
                    <section className="mt-12">
                        <h2 className="text-2xl font-bold mb-2">Examples from this workflow</h2>
                        <p className="text-white/50 text-sm mb-4">
                            Generated with the same AI tools we teach in the course.
                        </p>
                        {post.media.map((m, i) => (
                            <MediaBlock key={i} media={m} />
                        ))}
                    </section>
                )}

                {/* Internal CTA — the ranking target. */}
                <div className="mt-14 glass-card rounded-2xl border-primary/30 p-8 text-center">
                    <h2 className="text-2xl font-bold mb-2">
                        Want to create videos like these?
                    </h2>
                    <p className="text-white/60 mb-6 max-w-xl mx-auto">
                        Learn the full AI video and filmmaking workflow — from prompt to
                        finished scene — step by step.
                    </p>
                    <Link
                        href="/courses"
                        className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
                    >
                        Explore the AI Video Course <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </article>
            <Footer />
        </main>
    )
}
