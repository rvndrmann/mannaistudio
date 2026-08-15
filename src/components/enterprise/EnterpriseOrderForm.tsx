"use client"

import { useEffect, useState } from "react"
import { BadgeCheck, Loader2, Users } from "lucide-react"
import { enterpriseCreditsFor } from "@/lib/enterprise"

type EnterpriseRate = { usdPerMinute: number; currency: string; enabled: boolean }
type EnterpriseOrder = {
  id: string
  project_id: string | null
  minutes: number
  rate_usd_per_minute: number
  total_usd: number
  status: string
  brief: string
  admin_note: string
  created_at: string
  credits_charged?: number
  credits_refunded_at?: string | null
}

const statusCopy: Record<string, string> = {
  requested: "Request received",
  quoted: "Quote sent",
  in_production: "In production",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export default function EnterpriseOrderForm({
  projectId,
  projectName,
  onPlaced,
  compact = false,
}: {
  projectId?: string
  projectName?: string
  onPlaced?: () => void
  compact?: boolean
}) {
  const [rate, setRate] = useState<EnterpriseRate | null>(null)
  const [orders, setOrders] = useState<EnterpriseOrder[]>([])
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [minutes, setMinutes] = useState("1")
  const [brief, setBrief] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [placed, setPlaced] = useState<EnterpriseOrder | null>(null)

  const load = async () => {
    try {
      const response = await fetch("/api/enterprise", { cache: "no-store" })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Could not load enterprise details")
      setRate(json.rate)
      setOrders(json.orders || [])
      setCreditBalance(typeof json.creditBalance === "number" ? json.creditBalance : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load enterprise details")
    }
  }

  useEffect(() => { void load() }, [])

  const parsedMinutes = Number(minutes)
  const validMinutes = Number.isFinite(parsedMinutes) && parsedMinutes > 0
  const total = rate && validMinutes ? Math.round(parsedMinutes * rate.usdPerMinute * 100) / 100 : 0
  // The same conversion the database performs, so the number on the button is
  // the number that leaves the wallet.
  const creditsNeeded = rate && validMinutes ? enterpriseCreditsFor(parsedMinutes, rate.usdPerMinute) : 0
  const shortBy = creditBalance !== null && creditsNeeded > creditBalance ? creditsNeeded - creditBalance : 0

  const submit = async () => {
    if (!validMinutes) {
      setError("Enter how many finished minutes you need")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/enterprise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: parsedMinutes, brief, projectId, contactName, contactPhone }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Could not place the order")
      setPlaced(json.order)
      setBrief("")
      await load()
      onPlaced?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place the order")
    } finally {
      setBusy(false)
    }
  }

  const projectOrders = projectId ? orders.filter((order) => order.project_id === projectId) : orders

  if (!rate) {
    return <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#b9f42e]" /></div>
  }

  if (placed) {
    return (
      <div className="rounded-2xl border border-[#b9f42e]/30 bg-[#b9f42e]/[0.06] p-6 text-center">
        <BadgeCheck className="mx-auto h-8 w-8 text-[#b9f42e]" />
        <p className="mt-3 text-sm font-bold text-white">Request sent to the production team</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-400">
          {placed.minutes} finished minute{placed.minutes === 1 ? "" : "s"} at ${placed.rate_usd_per_minute}/min —
          <strong className="text-[#b9f42e]">${Number(placed.total_usd).toLocaleString()}</strong>.
          Nothing has been charged yet. The team reviews the request, and the credits are deducted only when we accept it and start work.
        </p>
        <button type="button" onClick={() => setPlaced(null)} className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]">
          Place another request
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#b9f42e]/15 text-[#b9f42e]"><Users className="h-5 w-5" /></span>
          <div>
            <h3 className="text-base font-bold text-white">Hire the AI Director Hub team</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Our team writes, directs, and delivers the finished video for you. Billed per finished minute, not per generation.
            </p>
          </div>
        </div>
      )}

      {!rate.enabled && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Enterprise production is not accepting new orders right now.
        </p>
      )}

      {projectName && (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-300">
          This request will be attached to <strong className="text-white">{projectName}</strong>, so the team starts from the script, assets, and storyboard already in it.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Finished minutes</span>
          <input
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            inputMode="decimal"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-[#b9f42e]/50"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Your name</span>
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            placeholder="Who should we speak to?"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-[#b9f42e]/50"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Phone (optional)</span>
        <input
          value={contactPhone}
          onChange={(event) => setContactPhone(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-[#b9f42e]/50"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">What do you need made?</span>
        <textarea
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          rows={compact ? 3 : 4}
          placeholder="Format, deadline, audience, references, anything already decided…"
          className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-[#b9f42e]/50"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Estimate</p>
          <p className="mt-1 text-2xl font-black text-[#b9f42e]">
            ${total.toLocaleString()} <span className="text-xs font-medium text-zinc-500">{rate.currency}</span>
          </p>
          <p className="text-[11px] text-zinc-500">{validMinutes ? `${parsedMinutes} min × $${rate.usdPerMinute}/min` : `$${rate.usdPerMinute} per finished minute`}</p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-300">
            ⚡ {creditsNeeded.toLocaleString()} credits on acceptance
            {creditBalance !== null && (
              <span className={`ml-2 font-normal ${shortBy ? "text-amber-300" : "text-zinc-500"}`}>
                (balance {creditBalance.toLocaleString()}{shortBy ? ` — top up ${shortBy.toLocaleString()} before we can accept` : ""})
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !validMinutes || !rate.enabled}
          className="rounded-xl bg-[#b9f42e] px-5 py-3 text-sm font-black text-black transition hover:bg-[#a6de25] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request the team"}
        </button>
      </div>

      <p className="text-[11px] leading-5 text-zinc-500">
        Requesting is free. We review it first, and the credits above are deducted only when we accept the order and begin work —
        so top up before then if your balance is short. Once accepted, the fee is not refundable if the project is cancelled part-way.
      </p>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}

      {projectOrders.length > 0 && (
        <div className="pt-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Your requests</p>
          <ul className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/10">
            {projectOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-100">
                    {order.minutes} min · ${Number(order.total_usd).toLocaleString()}
                    <span className="ml-2 font-normal text-zinc-500">{order.credits_charged ? `⚡ ${order.credits_charged.toLocaleString()} charged` : "not charged yet"}</span>
                  </p>
                  <p className="text-[11px] text-zinc-500">{new Date(order.created_at).toLocaleDateString()}{order.admin_note ? ` · ${order.admin_note}` : ""}</p>
                </div>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                  {statusCopy[order.status] || order.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
