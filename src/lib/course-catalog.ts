import type { SupabaseClient } from "@supabase/supabase-js"
import { isFreeCourse } from "@/lib/course-price"

/**
 * The public course catalogue: what a stranger is shown before signing in.
 *
 * /my-courses answers "what do I own"; this answers "what is there", and the
 * two were one page — which meant a visitor who clicked "View all courses" from
 * the homepage landed on a student dashboard asking them to sign in.
 */

export type CatalogCourse = {
  id: string
  title: string
  description: string
  thumbnail: string
  level: string
  chapters: number
  duration: string
  isFree: boolean
}

/**
 * A course length worth printing, or "".
 *
 * The admin form seeds a new course with "0 Hours", and that default has been
 * published as though it were a fact. Anything that reads as zero is treated as
 * not entered.
 */
export function courseDurationLabel(duration: unknown): string {
  if (typeof duration !== "string") return ""
  const trimmed = duration.trim()
  if (!trimmed || /^0+(\.0+)?\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)?\.?$/i.test(trimmed)) return ""
  return trimmed
}

/** "Beginner · 6 lessons · 12 min", leaving out whatever is not known. */
export function courseMetaLine(course: Pick<CatalogCourse, "level" | "chapters" | "duration">): string {
  const lessons = course.chapters > 0 ? `${course.chapters} ${course.chapters === 1 ? "lesson" : "lessons"}` : ""
  return [course.level, lessons, courseDurationLabel(course.duration)].filter(Boolean).join(" · ")
}

/** Course titles are typed in capitals in admin as often as not. */
export function courseDisplayTitle(title: string): string {
  const letters = title.replace(/[^A-Za-z]/g, "")
  if (!letters || letters !== letters.toUpperCase()) return title
  return title.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).replace(/\bAi\b/g, "AI")
}

export async function fetchCatalogCourses(supabase: SupabaseClient): Promise<CatalogCourse[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id,title,description,thumbnail,level,chapters,duration,price,sort_order,created_at")
    .eq("is_published", true)
    .eq("is_paused", false)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
  if (error || !data) return []
  return data.map((row) => ({
    id: String(row.id),
    title: courseDisplayTitle(typeof row.title === "string" ? row.title : ""),
    description: typeof row.description === "string" ? row.description.trim() : "",
    thumbnail: typeof row.thumbnail === "string" ? row.thumbnail : "",
    level: typeof row.level === "string" ? row.level : "",
    chapters: typeof row.chapters === "number" ? row.chapters : 0,
    duration: typeof row.duration === "string" ? row.duration : "",
    isFree: isFreeCourse(row.price),
  }))
}

/** Where "Start the free course" goes: one stable address for every button. */
export const FREE_COURSE_PATH = "/free-course"
export const PRO_PATH = "/billing"
export const PRO_CTA_LABEL = "Get Pro · ₹799/month"
