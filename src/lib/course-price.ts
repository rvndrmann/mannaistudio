/**
 * Whether a course costs nothing.
 *
 * `price` is free text entered in admin, not a number: it has been "Free",
 * "$0", "0", 0, and empty, and the courses page has always had to test all of
 * them. That test existed twice in that page and a third copy on the home page
 * got it wrong — `Number("Free")` is NaN, so the free course did not look free
 * and the button pointed at the listing instead of the course.
 */
export function isFreeCourse(price: unknown): boolean {
  if (price === null || price === undefined || price === "") return true
  if (typeof price === "number") return price === 0
  if (typeof price !== "string") return false
  const trimmed = price.trim()
  if (!trimmed) return true
  if (trimmed.toLowerCase() === "free") return true
  // Allow a leading currency symbol, but the rest must actually be a number:
  // stripping non-digits unconditionally turned "contact us" into "", and
  // Number("") is 0, so text with no price in it read as free.
  const match = trimmed.match(/^[^\d.-]*(-?\d+(?:\.\d+)?)$/)
  return match ? Number(match[1]) === 0 : false
}
