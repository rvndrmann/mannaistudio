"use client"

import { useState } from "react"
import { Sparkles, X, Lock } from "lucide-react"

export function ComingSoonBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-bold text-yellow-400 backdrop-blur-md ${className}`}>
      <Lock className="h-3 w-3" />
      COMING SOON
    </span>
  )
}

export function DemoDataBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-400 backdrop-blur-md ${className}`}>
      <Sparkles className="h-3 w-3" />
      DEMO DATA
    </span>
  )
}

export function FeatureUnavailableModal({
  isOpen,
  onClose,
  featureName,
  platform,
  description,
}: {
  isOpen: boolean
  onClose: () => void
  featureName: string
  platform?: string
  description?: string
}) {
  const [notified, setNotified] = useState(false)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#161817] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <ComingSoonBadge />
              <h3 className="mt-1 text-lg font-bold text-white">{featureName}</h3>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-zinc-300">
          {description || `${platform ? `${platform} integration` : featureName} is ready in the AI Director Hub interface but requires API configuration before accounts can be connected.`}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setNotified(true)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10"
          >
            {notified ? "✓ Added to wishlist" : "Notify Me"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#b9f42e] px-4 py-2.5 text-sm font-bold text-black hover:bg-[#a6de26]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
