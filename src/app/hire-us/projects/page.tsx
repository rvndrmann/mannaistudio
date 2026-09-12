"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import { useAuth } from "@/components/auth/auth-provider"
import ManagedProjectCards, { useManagedProjects } from "@/components/managed/ManagedProjectCards"

/**
 * Managed Production — the client's list of campaigns.
 *
 * Deliberately not under /studio: that whole tree is operator tooling behind an
 * admin gate, and a client who hired the team should never be sent there. This
 * is the only project list they have, and it says nothing about how the work
 * gets made.
 */
export default function ManagedProjectsPage() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const { projects, loading } = useManagedProjects()

  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="mx-auto max-w-6xl px-5 pt-28 pb-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Managed Production</h1>
            <p className="mt-2 text-white/45">Campaigns our creative team is making for you.</p>
          </div>
          <Link
            href="/hire-us"
            className="flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-black transition hover:brightness-110 active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        </div>

        <div className="mt-8">
          {!authLoading && !user ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-sm text-white/50">Sign in to see your projects.</p>
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="mt-4 h-10 rounded-md bg-primary px-5 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Sign in with Google
              </button>
            </div>
          ) : (
            <ManagedProjectCards projects={projects} loading={loading || authLoading} />
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}
