"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

type AdminOrder = {
  id: string
  user_id: string
  project_id: string | null
  minutes: number
  rate_usd_per_minute: number
  total_usd: number
  status: string
  brief: string
  contact_name: string
  contact_email: string
  contact_phone: string
  admin_note: string
  created_at: string
}

const statuses = ["requested", "quoted", "in_production", "delivered", "cancelled"] as const

export default function AdminEnterpriseOrders() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rate, setRate] = useState("200")
  const [enabled, setEnabled] = useState(true)
  const [savingRate, setSavingRate] = useState(false)
  const [rateMessage, setRateMessage] = useState("")

  const load = useCallback(async () => {
    try {
      const [ordersResponse, rateResponse] = await Promise.all([
        fetch("/api/admin/enterprise", { cache: "no-store" }),
        fetch("/api/enterprise", { cache: "no-store" }),
      ])
      const json = await ordersResponse.json()
      if (!ordersResponse.ok) throw new Error(json.error || "Could not load orders")
      setOrders(json.orders)

      const rateJson = await rateResponse.json()
      if (rateResponse.ok && rateJson.rate) {
        setRate(String(rateJson.rate.usdPerMinute))
        setEnabled(Boolean(rateJson.rate.enabled))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders")
      setOrders([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const saveRate = async (nextEnabled = enabled) => {
    const parsed = Number(rate)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setRateMessage("Enter a whole dollar rate above zero")
      return
    }
    setSavingRate(true)
    setRateMessage("")
    try {
      const response = await fetch("/api/admin/enterprise", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdPerMinute: parsed, enabled: nextEnabled }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Could not update the rate")
      setEnabled(Boolean(json.rate?.enabled))
      setRateMessage("Rate saved. Existing orders keep the price they were quoted.")
    } catch (err) {
      setRateMessage(err instanceof Error ? err.message : "Could not update the rate")
    } finally {
      setSavingRate(false)
    }
  }

  const update = async (orderId: string, status: string, adminNote?: string) => {
    setBusyId(orderId)
    setError(null)
    try {
      const response = await fetch("/api/admin/enterprise", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status, adminNote }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Could not update the order")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the order")
    } finally {
      setBusyId(null)
    }
  }

  if (!orders) return <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Enterprise rate</p>
            <p className="mt-1 text-xs text-white/40">Charged per finished minute of delivered video.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-lg font-black text-white">$</span>
              <input
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                inputMode="numeric"
                className="w-28 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-lg font-black text-white outline-none focus:border-primary"
              />
              <span className="text-xs font-medium text-white/40">USD / minute</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => saveRate()}
              disabled={savingRate}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60"
            >
              {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save rate
            </button>
            <button
              type="button"
              onClick={() => { setEnabled(!enabled); void saveRate(!enabled) }}
              disabled={savingRate}
              className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition disabled:opacity-60 ${
                enabled ? "border-white/10 text-white/60 hover:bg-white/10" : "border-amber-500/40 bg-amber-500/10 text-amber-200"
              }`}
            >
              {enabled ? "Accepting orders" : "Orders paused"}
            </button>
          </div>
        </div>
        {rateMessage && <p className="mt-3 text-xs text-white/50">{rateMessage}</p>}
      </div>

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}

      {!orders.length ? (
        <p className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/40">
          No enterprise requests yet.
        </p>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">
                  {order.minutes} min · ${Number(order.total_usd).toLocaleString()}
                  <span className="ml-2 text-xs font-medium text-white/35">at ${order.rate_usd_per_minute}/min</span>
                </p>
                <p className="mt-1 text-xs text-white/40">
                  {order.contact_name || "No name given"}
                  {order.contact_email ? ` · ${order.contact_email}` : ""}
                  {order.contact_phone ? ` · ${order.contact_phone}` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-white/25">
                  {new Date(order.created_at).toLocaleString()}
                  {order.project_id ? " · attached to a Studio project" : " · no project attached"}
                </p>
              </div>
              <select
                value={order.status}
                disabled={busyId === order.id}
                onChange={(event) => update(order.id, event.target.value, order.admin_note)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-primary"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </div>

            {order.brief && (
              <p className="mt-3 whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-black/30 p-3 text-xs leading-5 text-white/60">
                {order.brief}
              </p>
            )}

            <label className="mt-3 block space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Note to client</span>
              <input
                defaultValue={order.admin_note}
                onBlur={(event) => {
                  if (event.target.value !== order.admin_note) void update(order.id, order.status, event.target.value)
                }}
                placeholder="Quote sent, kickoff booked, delivery date…"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-primary"
              />
            </label>
          </div>
        ))
      )}
    </div>
  )
}
