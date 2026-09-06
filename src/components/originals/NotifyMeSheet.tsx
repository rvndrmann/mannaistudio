"use client"

import { useEffect, useState } from "react"
import { BellRing, Check, Loader2, X } from "lucide-react"

/**
 * "Tell me when episode N is out."
 *
 * Drawn inside the player frame like the paywall, and for the same reason: the
 * viewer who has just watched everything there is deserves an answer without
 * leaving the page they were watching on.
 *
 * A signed-in viewer sees no fields at all — their account address is already
 * known, and asking them to retype it is the friction that loses the ask. Only
 * someone signed out is asked for a way to reach them, and the phone number
 * stays optional.
 */

type Props = {
  slug: string
  episodeNumber: number
  seriesTitle: string
  signedIn: boolean
  /** Prefilled for a signed-in viewer, shown as read-only reassurance. */
  knownEmail?: string | null
  onClose: () => void
}

export default function NotifyMeSheet({ slug, episodeNumber, seriesTitle, signedIn, knownEmail, onClose }: Props) {
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Confirmation is the whole payload here, so it does not need to sit there
    // until it is dismissed.
    if (!done) return
    const timer = setTimeout(onClose, 2600)
    return () => clearTimeout(timer)
  }, [done, onClose])

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/originals/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          episodeNumber,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not save that")
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that")
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = signedIn || email.trim().length > 3 || phone.trim().length > 5

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/85 px-5 text-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      {done ? (
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/20">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-4 text-lg font-semibold">You&apos;re on the list</p>
          <p className="mt-1 text-sm text-white/55">
            We&apos;ll message you the moment episode {episodeNumber} goes up.
          </p>
        </div>
      ) : (
        <div className="w-full max-w-xs">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/15">
            <BellRing className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-4 text-lg font-semibold">Episode {episodeNumber} is coming</p>
          <p className="mt-1 text-sm text-white/55">
            It isn&apos;t out yet. Want a message when it lands?
          </p>

          {signedIn ? (
            <p className="mt-4 rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/55">
              We&apos;ll write to {knownEmail || "your account email"}.
            </p>
          ) : (
            <div className="mt-4 space-y-2 text-left">
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm outline-none transition focus:border-primary"
              />
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm outline-none transition focus:border-primary"
              />
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={saving || !canSubmit}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            {saving ? "Saving..." : "Notify me"}
          </button>
          <p className="mt-2.5 text-[11px] text-white/35">
            Only about {seriesTitle}. Nothing else.
          </p>
        </div>
      )}
    </div>
  )
}
