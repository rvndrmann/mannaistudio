"use client"
import { useState } from "react"
import type { ManagedPlan } from "@/lib/managed/progress"
function localDate(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
export default function ManagedDeliveryPlan({ project, busy, save }: { project: ManagedPlan; busy: boolean; save: (body: Record<string, unknown>, label: string) => Promise<void> }) {
  const [due, setDue] = useState(localDate(project.delivery_due_at))
  const [update, setUpdate] = useState(project.client_update || "")
  const [remaining, setRemaining] = useState((project.remaining_tasks || []).join("\n"))
  return <section className="space-y-3 rounded-xl border border-white/10 p-4">
    <h4 className="text-sm font-bold">Customer delivery plan</h4><p className="text-xs text-white/45">Saving publishes this update to the customer project and chat.</p>
    <label className="block text-xs text-white/60">Expected delivery (your local time)<input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 p-2 text-white" /></label>
    <label className="block text-xs text-white/60">Current work<textarea maxLength={3000} value={update} onChange={(event) => setUpdate(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 p-2 text-white" /></label>
    <label className="block text-xs text-white/60">Remaining work (one task per line)<textarea value={remaining} onChange={(event) => setRemaining(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 p-2 text-white" /></label>
    <button type="button" disabled={busy} onClick={() => void save({ action: "delivery_plan", deliveryDueAt: due ? new Date(due).toISOString() : null, clientUpdate: update, remainingTasks: remaining.split("\n").map((task) => task.trim()).filter(Boolean) }, "delivery-plan")} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black disabled:opacity-50">Save customer update</button>
  </section>
}
