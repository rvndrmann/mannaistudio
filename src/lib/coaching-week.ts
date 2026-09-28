const INDIA_TIME_ZONE = "Asia/Kolkata"

function indiaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function mondayOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  const weekday = day.getUTCDay()
  day.setUTCDate(day.getUTCDate() - ((weekday + 6) % 7))
  return day.toISOString().slice(0, 10)
}

export function coachingWeekStarts(now = new Date()) {
  const current = new Date(`${mondayOf(indiaDate(now))}T00:00:00Z`)
  const next = new Date(current)
  next.setUTCDate(next.getUTCDate() + 7)
  return [current.toISOString().slice(0, 10), next.toISOString().slice(0, 10)] as const
}
