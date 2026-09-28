import { Check } from "lucide-react"

export function CourseHighlights({ highlights, description }: { highlights?: string[] | null; description?: string | null }) {
    const points = (highlights || []).map(point => point.trim()).filter(Boolean)
    const legacyPoints = !points.length && description?.includes("\n")
        ? description.split("\n").map(point => point.trim()).filter(point => point && !/^includes?:?$/i.test(point))
        : []
    const visible = points.length ? points : legacyPoints

    if (!visible.length) return description ? <p className="mt-2 line-clamp-2 text-sm text-white/50">{description}</p> : null

    return <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">What you get</p>
        <ul className="mt-2 space-y-1.5">
            {visible.slice(0, 4).map((point, index) => <li key={index} className="flex items-start gap-2 text-sm text-white/65"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{point}</span></li>)}
        </ul>
    </div>
}
