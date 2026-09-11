"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  AlertCircle,
  Check,
  Clapperboard,
  CreditCard,
  Loader2,
  Play,
  Receipt,
  Ticket,
  Zap,
} from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/auth/auth-provider"
import { useCreditPackCheckout } from "@/components/originals/use-credit-pack-checkout"
import { createClient } from "@/lib/supabase/client"
import { formatUsdWithInr } from "@/lib/currency"
import { fetchMyPayments, type PaymentRecord } from "@/lib/membership"
import {
  DEFAULT_EPISODE_PRICE,
  ORIGINALS_CREDIT_PACKAGES,
  UNLOCK_WINDOW_DAYS,
  unlockTimeRemaining,
} from "@/lib/originals"
import { onCreditBalanceChanged } from "@/lib/credit-balance-events"

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
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState<string | null>(null)

  const { buyPack, pendingPackId, error } = useCreditPackCheckout({
    onPurchased: setBalance,
    onSuccess: setSuccess,
  })

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const supabase = createClient()
    // One round trip rather than four sequential ones: this page is the first
    // thing a viewer opens after paying, and it should not spend a second
    // waiting on requests that do not depend on each other.
    const [profileRes, unlockRes, passRes, paymentRows] = await Promise.all([
      supabase.from("profiles").select("credits_balance").eq("id", user.id).maybeSingle(),
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
    setUnlocks((unlockRes.data as UnlockRow[] | null) || [])
    setPasses(((passRes.data as unknown as PassRow[] | null) || []))
    setPayments(paymentRows)
    setLoading(false)
  }, [user])

  useEffect(() => { if (!authLoading) load() }, [authLoading, load])

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
          Credits, unlocked episodes, and your payment history.
        </p>

        {success && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 p-3 text-xs font-semibold text-primary">
            <Check className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 p-3 text-xs font-semibold text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Balance ---------------------------------------------------------- */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-primary/[0.12] to-transparent p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Balance</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums">
                {balance === null ? "—" : balance.toLocaleString()}
                <span className="ml-2 text-base font-medium text-white/40">credits</span>
              </p>
              <p className="mt-1 text-xs text-white/45">
                {DEFAULT_EPISODE_PRICE} credits per episode · about{" "}
                {balance === null ? "—" : Math.floor(balance / DEFAULT_EPISODE_PRICE)} episodes
              </p>
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

        {/* Packs ------------------------------------------------------------ */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/40">Top up</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(ORIGINALS_CREDIT_PACKAGES).map(([id, pack]) => {
              const best = id === "500"
              return (
                <button
                  key={id}
                  type="button"
                  disabled={pendingPackId !== null}
                  onClick={() => buyPack(id)}
                  className={`relative rounded-2xl border p-5 text-left transition disabled:opacity-60 ${
                    best
                      ? "border-primary bg-primary/[0.08] hover:bg-primary/[0.12]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  {best && (
                    <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                      Best value
                    </span>
                  )}
                  <p className="text-2xl font-semibold tabular-nums">{pack.credits.toLocaleString()}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">credits</p>
                  <p className="mt-3 text-sm font-semibold text-primary">{formatUsdWithInr(pack.priceInr)}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/45">
                    <Play className="h-3 w-3" />
                    about {Math.floor(pack.credits / DEFAULT_EPISODE_PRICE)} episodes
                  </p>
                  {pendingPackId === id && (
                    <Loader2 className="absolute right-4 top-4 h-4 w-4 animate-spin text-white/70" />
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] text-white/35">
            🔒 Secure checkout by Razorpay. Credits never expire.
          </p>
        </section>

        {/* Season passes ---------------------------------------------------- */}
        {passes.length > 0 && (
          <section className="mt-10">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/40">
              <Ticket className="h-4 w-4" /> Season passes
            </h2>
            <div className="mt-3 space-y-2">
              {passes.map((pass) => (
                <Link
                  key={pass.series_id}
                  href={pass.series ? `/originals/${pass.series.slug}` : "/originals"}
                  className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] p-4 transition hover:border-primary/60"
                >
                  <div>
                    <p className="text-sm font-semibold">{pass.series?.title || "Season pass"}</p>
                    <p className="text-xs text-white/45">Every episode until {dateLabel(pass.expires_at)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    {unlockTimeRemaining(pass.expires_at, 30) || "Active"}
                  </span>
                </Link>
              ))}
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
