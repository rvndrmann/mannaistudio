import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import ProofManager from "@/components/admin/ProofManager"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Proof manager | AI Director Hub", robots: { index: false } }

/**
 * Admin only, decided on the server: a non-admin is redirected before any of
 * the manager is sent, rather than being sent it and then hidden from it. The
 * rows themselves are protected separately by row security — this is about not
 * showing the tool, that is about not leaking the data.
 */
export default async function ProofAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/proof")
  const { data: admin } = await supabase.from("admin_users").select("id").eq("id", user.id).maybeSingle()
  if (!admin) redirect("/")

  return (
    <main className="min-h-screen bg-[#070807] text-white">
      <Navbar />
      <ProofManager />
    </main>
  )
}
