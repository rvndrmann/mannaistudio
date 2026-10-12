import { NextResponse, type NextRequest } from "next/server"
import { fetchCatalogCourses } from "@/lib/course-catalog"
import { createPublicClient } from "@/lib/proof"

export const dynamic = "force-dynamic"

/**
 * The free course, wherever it currently lives.
 *
 * Every "Start the free course" button on the site points here instead of at a
 * course id, so replacing or renaming the free course is an admin edit and not
 * a hunt through the homepage for links to a course that no longer exists.
 */
export async function GET(request: NextRequest) {
  const courses = await fetchCatalogCourses(createPublicClient())
  const free = courses.find((course) => course.isFree)
  return NextResponse.redirect(new URL(free ? `/courses/${free.id}` : "/courses", request.url))
}
