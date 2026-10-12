import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import Footer from "@/components/Footer"
import Navbar from "@/components/Navbar"
import { FreeCourseCta, ProCta } from "@/components/home/academy/cta"
import { courseMetaLine, fetchCatalogCourses } from "@/lib/course-catalog"
import { createPublicClient } from "@/lib/proof"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "AI Filmmaking Courses | AI Director Hub",
  description: "Every AI Director Hub course. Start with the free mini course; all other courses are included in AI Director Hub Pro at ₹799/month.",
}

/**
 * The course catalogue, for anyone.
 *
 * What a signed-in student owns lives at /my-courses. This is the page a
 * visitor is sent to from "View all courses": everything published, each one
 * marked Free or Included in Pro, and nothing that asks who they are first.
 */
export default async function CoursesPage() {
  // Free first: it is the one a visitor can start without deciding anything.
  const catalog = await fetchCatalogCourses(createPublicClient())
  const courses = [...catalog.filter((course) => course.isFree), ...catalog.filter((course) => !course.isFree)]

  return (
    <main className="min-h-screen bg-[#070807] text-white">
      <Navbar academy />
      <section className="mx-auto max-w-7xl px-5 pb-16 pt-28 sm:px-8 sm:pt-36">
        <p className="text-xs font-semibold tracking-[.22em] text-primary">COURSE CATALOG</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Learn to direct AI films</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60 sm:text-base">Start with the free course. Every other course, and each new one released while you are subscribed, is included in AI Director Hub Pro.</p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          <ProCta placement="catalog" className="w-full sm:w-auto" />
          <Link href="/my-courses" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">Already a student? My Courses <ArrowRight className="h-4 w-4" /></Link>
        </div>

        {courses.length === 0 ? (
          <p className="mt-12 rounded-xl border border-white/10 p-6 text-sm text-white/55">No courses are published right now.</p>
        ) : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const meta = courseMetaLine(course)
              return (
                <article key={course.id} className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">
                  <div className="relative aspect-video bg-[#0d0f0e]">
                    {course.thumbnail && <img src={course.thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                    <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${course.isFree ? "bg-primary text-black" : "bg-black/70 text-primary backdrop-blur-sm"}`}>{course.isFree ? "Free" : "Included in Pro"}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    {meta && <p className="text-xs text-white/55">{meta}</p>}
                    <h2 className="mt-2 text-lg font-semibold">{course.title}</h2>
                    {course.description && <p className="mt-2 text-sm leading-relaxed text-white/55">{course.description}</p>}
                    <div className="mt-auto pt-5">
                      {course.isFree
                        ? <FreeCourseCta placement="catalog-card" className="h-11 rounded-md bg-primary px-5 text-black no-underline hover:text-black hover:no-underline hover:brightness-110">Start free <ArrowRight className="h-4 w-4" /></FreeCourseCta>
                        : <Link href={`/courses/${course.id}`} className="inline-flex h-11 items-center gap-2 rounded-md border border-white/20 px-5 text-sm font-semibold hover:bg-white/10">See the course <ArrowRight className="h-4 w-4" /></Link>}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <Footer />
    </main>
  )
}
