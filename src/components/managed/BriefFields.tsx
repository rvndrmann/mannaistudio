"use client"

import { useRef, useState } from "react"
import { Loader2, Paperclip, X } from "lucide-react"
import type { ManagedAttachment } from "@/lib/managed-brief"
import { uploadBriefAsset, uploadProjectAsset } from "@/lib/managed/uploads"

/**
 * The form controls the brief is built from.
 *
 * Lifted out of the brief page because the revision form and the admin's notes
 * reach for the same three: a labelled field, a chip picker, and an uploader.
 * Keeping them here is what stops the brief and the revision sheet drifting
 * into two different-looking forms.
 */

export function Field({
  label, hint, children, optional,
}: { label: string; hint?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 text-xs font-bold text-white/55">
        {label}
        {optional && <span className="text-[10px] font-medium text-white/25">optional</span>}
      </span>
      {hint && <span className="mt-0.5 block text-[11px] text-white/30">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/25 transition focus:border-primary focus:outline-none"

export function TextField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-[96px] resize-y`} />
}

/** Single- or multi-select, rendered as chips because the lists are short. */
export function ChipPicker({
  options, value, onChange, multiple,
}: {
  options: readonly string[]
  value: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() =>
              onChange(
                multiple
                  ? active ? value.filter((item) => item !== option) : [...value, option]
                  : active ? [] : [option],
              )
            }
            className={`rounded-full border px-3.5 py-2 text-xs font-medium transition duration-press ease-out active:scale-[0.97] ${
              active
                ? "border-primary bg-primary/15 text-primary"
                : "border-white/12 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

/**
 * File attachments.
 *
 * Uploads go straight from the browser to storage — a product video is tens of
 * megabytes, and posting it through a route only to hand it back to storage
 * doubles the transfer for nothing. `projectId` decides where: without one the
 * file lands in the client's own folder and is adopted at checkout; with one it
 * goes into the project folder both sides can read.
 */
export function AttachmentPicker({
  kind, label, accept, value, onChange, projectId, multiple = true,
}: {
  kind: ManagedAttachment["kind"]
  label: string
  accept: string
  value: ManagedAttachment[]
  onChange: (next: ManagedAttachment[]) => void
  projectId?: string
  multiple?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const mine = value.filter((attachment) => attachment.kind === kind)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError("")
    try {
      const uploaded: ManagedAttachment[] = []
      for (const file of Array.from(files)) {
        const attachment = projectId
          ? { ...(await uploadProjectAsset(projectId, file)), kind }
          : await uploadBriefAsset(file, kind)
        uploaded.push(attachment)
      }
      onChange([...value.filter((item) => multiple || item.kind !== kind), ...uploaded])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file could not be uploaded.")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {label}
        </button>
        {mine.map((attachment) => (
          <span
            key={attachment.path}
            className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-3 pr-1.5 text-xs text-white/65"
          >
            <span className="truncate">{attachment.name || "File"}</span>
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item.path !== attachment.path))}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  )
}

/** Newline-separated links, which is how people actually paste a list of them. */
export function LinkList({ value, onChange, placeholder }: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  return (
    <TextArea
      value={value.join("\n")}
      placeholder={placeholder}
      onChange={(event) =>
        onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 12))
      }
    />
  )
}
