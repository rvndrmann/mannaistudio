import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import Link from "next/link"
import type { Metadata } from "next"
import { getPublishedPosts } from "@/lib/blog"

// ISR: cache the index, rebuild at most every 10 minutes. Keeps the blog fast
// and isolated — it never adds DB load to the rest of the site on each request.
export const revalidate = 600

const BASE_URL = "https://www.aidirectorhub.com"

export const metadata: Metadata = {
    title: "AI Video & Filmmaking Blog | AI Director Hub",
    description:
        "Tutorials, prompt examples, and real AI-generated video walkthroughs — learn AI video creation and filmmaking, then master it with our AI video course.",
    alternates: { canonical: `${BASE_URL}/blog` },
    openGraph: {
        title: "AI Video & Filmmaking Blog | AI Director Hub",
        description:
            "Tutorials, prompt examples, and real AI-generated video walkthroughs for aspiring AI filmmakers.",
        url: `${BASE_URL}/blog`,
        type: "website",
    },
}

function formatDate(value?: string | null) {
    if (!value) return ""
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    })
}

export default async function BlogIndexPage() {
    const posts = await getPublishedPosts()

    return (
        <main className="min-h-screen">
            <Navbar />
            <section className="pt-32 pb-20 px-6 max-w-6xl mx-auto">
                <p className="text-primary font-semibold mb-3 uppercase tracking-wider text-sm">
                    The AI Director Blog
                </p>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
                    AI Video Creation & Filmmaking
                </h1>
                <p className="text-white/50 mb-12 max-w-2xl">
                    Real AI-generated examples, prompt breakdowns, and step-by-step
                    workflows — everything we teach inside the{" "}
                    <Link href="/courses" className="text-primary hover:underline">
                        AI video course
                    </Link>
                    .
                </p>

                {posts.length === 0 ? (
                    <div className="glass-card p-10 rounded-2xl border-white/10 text-center text-white/40">
                        New articles are on the way. Check back soon.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {posts.map((post) => (
                            <Link
                                key={post.slug}
                                href={`/blog/${post.slug}`}
                                className="glass-card rounded-2xl border-white/10 overflow-hidden group hover:border-primary/40 transition-all flex flex-col"
                            >
                                <div className="aspect-video bg-white/5 overflow-hidden">
                                    {post.cover_image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={post.cover_image}
                                            alt={post.title ?? ""}
                                            loading="lazy"
                                            decoding="async"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">
                                            AI Director Hub
                                        </div>
                                    )}
                                </div>
                                <div className="p-5 flex flex-col flex-1">
                                    <p className="text-xs text-white/40 mb-2">
                                        {formatDate(post.published_at)}
                                    </p>
                                    <h2 className="text-lg font-bold leading-snug mb-2 group-hover:text-primary transition-colors">
                                        {post.title}
                                    </h2>
                                    <p className="text-sm text-white/50 line-clamp-3">
                                        {post.excerpt}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
            <Footer />
        </main>
    )
}
