"use client"

import { useEffect, useState } from "react"
import { Loader2, TrendingDown, TrendingUp } from "lucide-react"

type CreditTransaction = {
  id: string
  amount: number
  balance_after: number
  type: string
  model: string | null
  description: string | null
  created_at: string
}

const typeLabels: Record<string, string> = {
  generation: "Generation",
  purchase: "Credit Top Up",
  team_allocation: "Team Allocation",
  refund: "Refund",
  bonus: "Bonus",
}

function formatType(type: string) {
  return typeLabels[type] || type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default function CreditUsageTab() {
  const [transactions, setTransactions] = useState<CreditTransaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch("/api/credits/usage", { cache: "no-store" })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || "Could not load credit usage")
        if (!cancelled) setTransactions(json.transactions)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load credit usage")
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (error) return <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</p>
  if (!transactions) return <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#b9f42e]" /></div>
  if (!transactions.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <p className="text-sm font-semibold text-zinc-300">No credit activity yet</p>
        <p className="mt-1 text-xs text-zinc-500">Generations and top-ups will appear here.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-white/[0.04] text-[11px] text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Credits</th>
            <th className="px-4 py-3 font-semibold">Balance</th>
            <th className="px-4 py-3 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {transactions.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                {new Date(item.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-200">{formatType(item.type)}</td>
              <td className={`whitespace-nowrap px-4 py-3 font-bold ${item.amount < 0 ? "text-red-300" : "text-[#b9f42e]"}`}>
                <span className="inline-flex items-center gap-1">
                  {item.amount < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                  {item.amount > 0 ? "+" : ""}{item.amount.toLocaleString()}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-zinc-400">{item.balance_after.toLocaleString()}</td>
              <td className="px-4 py-3 text-zinc-400">
                {item.description || "—"}
                {item.model && <span className="mt-0.5 block text-[11px] text-zinc-600">{item.model}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
