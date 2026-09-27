import { redirect } from "next/navigation"

/** Course catalog and enrolled courses now live together on one student page. */
export default function CoursesPage() {
  redirect("/my-courses")
}
