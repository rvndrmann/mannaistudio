"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import EnterpriseOrderForm from "./EnterpriseOrderForm"

export default function ConvertToEnterpriseDialog({
  projectId,
  projectName,
  onClose,
  onPlaced,
}: {
  projectId: string
  projectName: string
  onClose: () => void
  onPlaced?: () => void
}) {
  // Portals need a document, so render nothing until after hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/15 bg-[#121412] p-6 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-lg font-bold">Hand this project to our team</h3>
        <p className="mt-1 max-w-md text-xs leading-5 text-zinc-400">
          Keep everything you have built. The AI Director Hub team picks the project up from where it
          is and delivers the finished video.
        </p>

        <div className="mt-5">
          <EnterpriseOrderForm projectId={projectId} projectName={projectName} onPlaced={onPlaced} compact />
        </div>
      </div>
    </div>,
    document.body,
  )
}
