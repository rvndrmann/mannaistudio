/** Canonical names and their hyphenated/underscored tags identify the same asset. */
export function entityMentionPattern(name: string, flags = "i") {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const canonical = name.trim()
  const slug = canonical.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const aliases = Array.from(new Set([canonical, slug, slug.replace(/-/g, "_")])).filter(Boolean)
  return new RegExp(`(^|[\\s([{,:;])@(?:${aliases.map(escape).join("|")})(?=$|[\\s)\\]},.!?:;'’])`, flags)
}
