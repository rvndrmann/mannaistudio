"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  Briefcase,
  Clapperboard,
  CreditCard,
  Loader2,
  Play,
  Receipt,
  Zap,
} from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { fetchMyPayments, type PaymentRecord } from "@/lib/membership"
import {
  UNLOCK_WINDOW_DAYS,
  unlockTimeRemaining,
} from "@/lib/originals"
import { onCreditBalanceChanged } from "@/lib/credit-balance-events"
import ManagedProjectCards, { useManagedProjects } from "@/components/managed/ManagedProjectCards"

/**
 * The viewer's account.
 *
 * /billing is the old membership page — plan tiers, subscriptions, studio
 * credit bundles — and none of it describes what a drama viewer buys. This is
 * the whole of their relationship with the site in one page: what they have,
 * what they are watching, how to top up, and what they have paid.
 */

type UnlockRow = {
  episode_id: string
  episode_number: number
  episode_title: string
  series_slug: string
  series_title: string
  poster_url: string | null
  credits_spent: number
  unlocked_at: string
  expires_at: string | null
}

type PassRow = {
  series_id: string
  expires_at: string
  series: { slug: string; title: string; poster_url: string | null } | null
}

const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

export default function AccountPage() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([])
  const [passes, setPasses] = useState<PassRow[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [contactPhone, setContactPhone] = useState("")
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneNotice, setPhoneNotice] = useState("")
  const [loading, setLoading] = useState(true)

  const { projects: managedProjects, loading: managedLoading } = useManagedProjects()

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const supabase = createClient()
    // One round trip rather than four sequential ones: this page is the first
    // thing a viewer opens after paying, and it should not spend a second
    // waiting on requests that do not depend on each other.
    const [profileRes, unlockRes, passRes, paymentRows] = await Promise.all([
      supabase.from("profiles").select("credits_balance,contact_phone").eq("id", user.id).maybeSingle(),
      supabase.rpc("originals_my_unlocks", { p_profile_id: user.id }),
      supabase
        .from("originals_season_passes")
        .select("series_id, expires_at, series:originals_series(slug, title, poster_url)")
        .eq("profile_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false }),
      fetchMyPayments(supabase, user.id),
    ])
    setBalance(Number(profileRes.data?.credits_balance ?? 0))
    setContactPhone(profileRes.data?.contact_phone || "")
    setUnlocks((unlockRes.data as UnlockRow[] | null) || [])
    setPasses(((passRes.data as unknown as PassRow[] | null) || []))
    setPayments(paymentRows)
    setLoading(false)
  }, [user])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

  const saveContactPhone = async () => {
    if (!user) return
    const phone = contactPhone.trim()
    if (phone && !/^\+?[0-9()\s-]{6,25}$/.test(phone)) {
      setPhoneNotice("Enter a valid phone number, including your country code if needed.")
      return
    }
    setSavingPhone(true)
    setPhoneNotice("")
    const { error } = await createClient().from("profiles").update({ contact_phone: phone || null }).eq("id", user.id)
    setPhoneNotice(error ? `Could not save phone number: ${error.message}` : "Phone number saved. Our team can use it to arrange your coaching sessions.")
    setSavingPhone(false)
  }

  // The nav's credit badge and this page must never disagree about the balance.
  // An event with no figure means "re-read it", not "it is zero".
  useEffect(
    () => onCreditBalanceChanged((next) => (typeof next === "number" ? setBalance(next) : void load())),
    [load],
  )

  if (authLoading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <Navbar />
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/50" />
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white">
        <Navbar />
        <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4">
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Zap className="h-6 w-6 fill-primary" />
            </div>
            <h1 className="mt-4 text-xl font-bold">Your account</h1>
            <p className="mt-2 text-sm text-white/50">
              Sign in to see your credits, the episodes you have unlocked, and what you have paid.
            </p>
            <button
              onClick={() => signInWithGoogle()}
              className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-black transition hover:brightness-110"
            >
              Continue with Google
            </button>
          </div>
        </div>
        <Footer />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="mx-auto max-w-4xl px-4 pb-20 pt-28">
        <h1 className="text-2xl font-bold sm:text-3xl">My Account</h1>
        <p className="mt-1 text-sm text-white/45">
          Your account, unlocked episodes, and payment history.
        </p>

        <section id="contact-details" className="mt-6 scroll-mt-28 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-base font-semibold">Contact details</h2>
          <p className="mt-1 text-sm text-white/50">Add a phone number so our team can contact you to schedule one-on-one coaching.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input type="tel" autoComplete="tel" aria-label="Phone number" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Phone number, including country code" className="min-w-[240px] flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white outline-none focus:border-primary" />
            <button type="button" onClick={() => void saveContactPhone()} disabled={savingPhone} className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-black disabled:opacity-50">{savingPhone ? "Saving…" : "Save number"}</button>
          </div>
          {phoneNotice && <p role="status" className="mt-3 text-sm text-primary">{phoneNotice}</p>}
        </section>

        {/* Balance ---------------------------------------------------------- */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-primary/[0.12] to-transparent p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Balance</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">
                {balance === null ? "—" : balance.toLocaleString()}
                <span className="ml-2 text-base font-medium text-white/40">credits</span>
              </p>
              <p className="mt-1 text-xs text-white/45">Credits are managed through Creator Studio.</p>
            </div>
            <Link
              href="/originals"
              className="flex h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <Clapperboard className="h-4 w-4" />
              Browse Originals
            </Link>
          </div>
        </section>

        {/* Managed production ----------------------------------------------- */}
        {(managedLoading || managedProjects.length > 0) && (
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/40">
                <Briefcase className="h-4 w-4" /> Managed production
              </h2>
              <Link href="/hire-us/projects" className="text-xs font-semibold text-primary hover:underline">
                All projects
              </Link>
            </div>
            <div className="mt-3">
              <ManagedProjectCards projects={managedProjects} loading={managedLoading} showEmpty={false} />
            </div>
          </section>
        )}

        {/* Unlocked episodes ------------------------------------------------ */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/40">
            <Play className="h-4 w-4" /> Unlocked episodes
          </h2>
          {loading ? (
            <div className="mt-4 flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : unlocks.length === 0 ? (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/45">
              Nothing unlocked yet. Every series opens with free episodes —{" "}
              <Link href="/originals" className="text-primary hover:underline">start watching</Link>.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {unlocks.map((unlock) => {
                const remaining = unlockTimeRemaining(unlock.expires_at)
                return (
                  <Link
                    key={unlock.episode_id}
                    href={`/originals/${unlock.series_slug}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {unlock.series_title} · Episode {unlock.episode_number}
                      </p>
                      <p className="truncate text-xs text-white/45">{unlock.episode_title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {unlock.expires_at ? (
                        <>
                          <p className={`text-xs font-semibold ${remaining ? "text-amber-300" : "text-white/60"}`}>
                            {remaining || `Until ${dateLabel(unlock.expires_at)}`}
                          </p>
                          <p className="text-[11px] text-white/35">{unlock.credits_spent} credits</p>
                        </>
                      ) : (
                        // Bought before the rental window existed, and kept on
                        // the terms it was sold under.
                        <p className="text-xs font-semibold text-primary">Yours to keep</p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-[11px] text-white/35">
            An unlocked episode plays for {UNLOCK_WINDOW_DAYS} days. Credits themselves never expire.
          </p>
        </section>

        {/* History ---------------------------------------------------------- */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/40">
            <Receipt className="h-4 w-4" /> Payment history
          </h2>
          {loading ? (
            <div className="mt-4 flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : payments.length === 0 ? (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/45">
              No payments yet.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wide text-white/40">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Item</th>
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.id} className="border-t border-white/[0.06]">
                      <td className="px-4 py-3">
                        <p className="text-white/85">{row.productInfo}</p>
                        <p className="text-[11px] text-white/35">{row.txnid}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-white/50">{dateLabel(row.createdAt)}</td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                          row.amount.startsWith("+") ? "text-primary" : "text-white/70"
                        }`}
                      >
                        {row.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-10 flex items-center gap-1.5 text-[11px] text-white/30">
          <CreditCard className="h-3 w-3" />
          Questions about a charge? <Link href="/contact" className="text-white/50 hover:text-white">Contact us</Link>
        </p>
      </div>

      <Footer />
    </main>
  )
}
