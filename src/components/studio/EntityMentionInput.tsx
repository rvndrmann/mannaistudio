"use client"

import { useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react"
import { AtSign } from "lucide-react"
import { findActiveEntityMention, findMentionedEntityIds, insertEntityMention, type MentionableEntity } from "@/lib/studio/entity-mentions"

type EntityMentionInputProps = {
  value: string
  onChange: (value: string) => void
  entities: MentionableEntity[]
  placeholder?: string
  className?: string
  menuPlacement?: "top" | "bottom"
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  ariaLabel?: string
  /**
   * The field itself, for callers that write a draft into it and then need to
   * put the caret where the user carries on typing.
   */
  textareaRef?: MutableRefObject<HTMLTextAreaElement | null>
}

const typeLabel: Record<MentionableEntity["type"], string> = {
  character: "Character",
  scene: "Scene",
  prop: "Asset",
}

export function EntityMentionInput({ value, onChange, entities, placeholder, className, menuPlacement = "bottom", onKeyDown, ariaLabel, textareaRef: externalRef }: EntityMentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(value.length)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dismissedMentionStart, setDismissedMentionStart] = useState<number | null>(null)
  const active = useMemo(() => findActiveEntityMention(value, caret), [caret, value])
  const options = useMemo(() => {
    if (!active || active.start === dismissedMentionStart) return []
    const query = active.query.trim().toLocaleLowerCase()
    return entities
      .filter((entity) => !query || entity.name.toLocaleLowerCase().includes(query) || entity.type.includes(query))
      .sort((a, b) => {
        const aStarts = a.name.toLocaleLowerCase().startsWith(query) ? 0 : 1
        const bStarts = b.name.toLocaleLowerCase().startsWith(query) ? 0 : 1
        return aStarts - bStarts || a.name.localeCompare(b.name)
      })
      .slice(0, 8)
  }, [active, dismissedMentionStart, entities])
  const mentionedIds = useMemo(() => findMentionedEntityIds(value, entities), [entities, value])
  const mentioned = useMemo(() => entities.filter((entity) => mentionedIds.includes(entity.id)), [entities, mentionedIds])

  const choose = (entity: MentionableEntity) => {
    if (!active) return
    const next = insertEntityMention(value, entity, active)
    onChange(next.value)
    setCaret(next.caret)
    setActiveIndex(0)
    setDismissedMentionStart(active.start)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (options.length && active) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((current) => (current + 1) % options.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((current) => (current - 1 + options.length) % options.length)
        return
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        choose(options[Math.min(activeIndex, options.length - 1)])
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setDismissedMentionStart(active.start)
        return
      }
    }
    onKeyDown?.(event)
  }

  return (
    <div className="relative">
      <textarea
        ref={(node) => {
          (textareaRef as MutableRefObject<HTMLTextAreaElement | null>).current = node
          if (externalRef) externalRef.current = node
        }}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setCaret(event.target.selectionStart)
          setActiveIndex(0)
          setDismissedMentionStart(null)
        }}
        onClick={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={Boolean(options.length)}
      />
      {options.length > 0 && active && (
        <div className={`absolute z-50 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#171817] p-1.5 shadow-2xl ${menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}>
          <div className="px-2 py-1 text-[10px] font-bold tracking-[0.16em] text-zinc-500">Mention a project entity</div>
          {options.map((entity, index) => (
            <button
              key={entity.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(entity)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left ${index === activeIndex ? "bg-[#b9f42e]/12 text-white" : "text-zinc-300 hover:bg-white/[0.05]"}`}
            >
              <span className="min-w-0 truncate text-sm"><span className="text-[#b9f42e]">@</span>{entity.name}</span>
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500">{typeLabel[entity.type]}</span>
            </button>
          ))}
        </div>
      )}
      {mentioned.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Referenced entities">
          {mentioned.map((entity) => (
            <span key={entity.id} className="inline-flex items-center gap-1 rounded-full border border-[#b9f42e]/20 bg-[#b9f42e]/5 px-2 py-0.5 text-[10px] font-medium text-[#d9ff84]">
              <AtSign className="h-2.5 w-2.5" />{entity.name}<span className="text-zinc-500">· {typeLabel[entity.type]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
