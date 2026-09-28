"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowRight, CalendarClock } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { coachingWeekStarts } from "@/lib/coaching-week"

type Offer = { id: string; title: string; description: string; price: number; duration_minutes: number; session_count: number; benefits: string[] }
type Week = { weekStart: string; booked: number; reserved: number; capacity: number | null; full: boolean }

export default function CoachingOfferCard() {
  const { user } = useAuth()
  const [offer, setOffer] = useState<Offer | null>(null)
  const [weeks, setWeeks] = useState<Week[]>([])
  const [selectedWeek, setSelectedWeek] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [purchaseComplete, setPurchaseComplete] = useState(false)

  const refreshAvailability = useCallback(async (offerId: string) => {
    const response = await fetch(`/api/academy-offers/availability?id=${encodeURIComponent(offerId)}`, { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Could not load coaching availability.")
    setWeeks(data.weeks || [])
    setSelectedWeek((selected) => (data.weeks || []).some((week: Week) => week.weekStart === selected && !week.full)
      ? selected
      : data.weeks?.find((week: Week) => !week.full)?.weekStart || "")
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error } = await createClient().from("academy_offers")
          .select("id,title,description,price,duration_minutes,session_count,benefits")
          .eq("offer_type", "coaching").eq("active", true).order("featured", { ascending: false }).limit(1).maybeSingle()
        if (error) throw error
        if (!active || !data) return
        setOffer(data)
        const response = await fetch(`/api/academy-offers/availability?id=${encodeURIComponent(data.id)}`, { cache: "no-store" })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || "Could not load coaching availability.")
        if (active) {
          setWeeks(result.weeks || [])
          setSelectedWeek(result.weeks?.find((week: Week) => !week.full)?.weekStart || coachingWeekStarts()[0])
        }
      } catch (error) {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load coaching offer.")
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!offer) return
    const timer = window.setInterval(() => { void refreshAvailability(offer.id).catch((error) => setNotice(error instanceof Error ? error.message : "Could not refresh availability.")) }, 30000)
    return () => window.clearInterval(timer)
  }, [offer, refreshAvailability])

  const book = async () => {
    if (!offer) return
    if (!user) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return }
    setBusy(true)
    setNotice("")
    try {
      if (!(window as any).Razorpay) {
        const script = document.createElement("script")
        script.src = "https://checkout.razorpay.com/v1/checkout.js"
        await new Promise<void>((resolve, reject) => { script.onload = () => resolve(); script.onerror = () => reject(new Error("Could not load payment checkout.")); document.body.appendChild(script) })
      }
      const response = await fetch("/api/academy-offers/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: offer.id, week_start: selectedWeek }),
      })
      const order = await response.json()
      if (!response.ok) throw new Error(order.error || "Could not start checkout.")
      const checkout = new (window as any).Razorpay({
        key: order.keyId, order_id: order.orderId, amount: order.amount, currency: "INR",
        name: "AI Director Hub", description: order.offerTitle,
        prefill: { email: order.email, name: order.name }, theme: { color: "#b9f42e" },
        handler: async (payment: unknown) => {
          try {
            const verified = await fetch("/api/academy-offers/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payment) })
            const result = await verified.json()
            setNotice(verified.ok ? result.message : result.error)
            if (verified.ok) {
              setPurchaseComplete(true)
              await refreshAvailability(offer.id).catch(() => undefined)
            }
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "Payment verification failed. Contact support if you were charged.")
          } finally {
            setBusy(false)
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      checkout.open()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not start checkout.")
      setBusy(false)
    }
  }

  if (!offer) return null
  return <section className="rounded-2xl border border-primary/20 bg-primary/[.04] p-6 sm:p-7">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-primary"><CalendarClock className="h-4 w-4"/> Private coaching</div>
    <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-xl font-semibold">{offer.title}</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">{offer.description || "Get one-on-one help with your AI video workflow."}</p></div><p className="shrink-0 text-lg font-bold text-primary">₹{offer.price}</p></div>
    <p className="mt-3 text-xs text-white/45">{offer.duration_minutes} minutes · {offer.session_count} session{offer.session_count === 1 ? "" : "s"} · includes access to every course</p>
    {offer.benefits?.length > 0 && <ul className="mt-4 grid gap-2 text-sm text-white/60 sm:grid-cols-2">{offer.benefits.map((benefit, index) => <li key={index}>• {benefit}</li>)}</ul>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">{weeks.map((week, index) => <button key={week.weekStart} type="button" disabled={week.full} onClick={() => setSelectedWeek(week.weekStart)} className={`rounded-xl border p-4 text-left transition ${selectedWeek === week.weekStart ? "border-primary bg-primary/10" : "border-white/10 bg-black/20"} ${week.full ? "cursor-not-allowed opacity-55" : "hover:border-primary/50"}`}><span className="flex items-center justify-between gap-3"><span className="font-semibold">{index === 0 ? "This week" : "Next week"}</span><span className={`text-xs ${week.full ? "text-amber-300" : "text-primary"}`}>{week.full ? "Fully booked" : week.capacity === null ? "Places available" : `${Math.max(0, week.capacity - week.booked - week.reserved)} of ${week.capacity} places left`}</span></span><span className="mt-1 block text-xs text-white/45">Week of {new Date(`${week.weekStart}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></button>)}</div>
    {weeks[0]?.full && <p className="mt-3 text-sm text-amber-200">This week is booked. Prebook your place for next week.</p>}
    {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
    {purchaseComplete && <Link href="/account#contact-details" className="mt-2 inline-block text-sm font-semibold text-primary underline">Add your phone number in My Account</Link>}
    <button type="button" onClick={() => void book()} disabled={busy || purchaseComplete || !selectedWeek || weeks.find((week) => week.weekStart === selectedWeek)?.full} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">{purchaseComplete ? "Booking confirmed" : busy ? "Opening checkout…" : `Book ${selectedWeek === weeks[1]?.weekStart ? "next week" : "this week"} · ₹${offer.price}`}<ArrowRight className="h-4 w-4"/></button>
  </section>
}
