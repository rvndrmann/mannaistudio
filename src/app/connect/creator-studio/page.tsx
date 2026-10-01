import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { hasCreatorStudioEntitlement } from "@/lib/studio/entitlement"
import { fetchSiteFeatures } from "@/lib/studio/feature-flags"
import { pendingConsent } from "@/lib/studio/mcp/oauth"
import { isManagedScope, mcpResource, scopeLabels } from "@/lib/studio/mcp/config"
import Connections from "./Connections"
export const dynamic = "force-dynamic"
export default async function CreatorStudioConnect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=%2Fconnect%2Fcreator-studio")
  let endpoint: string
  try { endpoint = mcpResource() } catch {
    return <main className="mx-auto max-w-2xl px-6 py-24"><h1 className="text-3xl font-semibold">Connect Creator Studio</h1><p className="mt-4 text-white/70">Assistant connections are being set up. Please try again later.</p><Link href="/studio" className="mt-6 inline-block underline">Back to Studio</Link></main>
  }
  const pending = await pendingConsent()
  const entitled = await hasCreatorStudioEntitlement(supabase, user.id)
  const enabled = (await fetchSiteFeatures(supabase)).mcp
  const availableScopes: string[] = pending ? (entitled ? pending.scopes : pending.scopes.filter(isManagedScope)) : []
  return <main className="mx-auto max-w-2xl px-6 py-16 space-y-8">
    <Link href="/studio" className="text-sm text-white/60 hover:text-white">← Back to Studio</Link>
    <div><h1 className="text-3xl font-semibold">Connect Creator Studio</h1><p className="mt-3 text-white/70">Signed in as <strong className="text-white">{user.email}</strong>. Assistants can access only projects owned by this account.</p></div>
    {!enabled && <p role="alert" className="text-amber-200">Assistant connections are currently paused. You can still disconnect existing assistants below.</p>}
    {pending ? <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div><h2 className="text-xl font-semibold">Allow {pending.clientName} to connect?</h2><p className="mt-2 text-sm text-white/60">This is the client name supplied by the assistant. The connection returns to <strong className="text-white">{new URL(pending.redirect_uri).host}</strong>.</p></div>
      <ul className="space-y-3 text-white/80">{availableScopes.map((scope: string) => <li key={scope}>• {scopeLabels[scope] || scope}</li>)}</ul>
      <p className="text-sm text-white/60">Disconnect at any time from this page. Your sign-in credentials and provider API keys are never sent to the assistant.</p>
      {!entitled && <p role="alert" className="text-amber-200">You can connect your hired-team orders. Creating and generating in Creator Studio requires active Studio access.</p>}
      <form action="/api/mcp/oauth/consent" method="POST" className="flex gap-3">
        <input type="hidden" name="requestId" value={pending.id} />
        <input type="hidden" name="accountId" value={user.id} />
        <button name="decision" value="approve" disabled={!availableScopes.length || !enabled} className="rounded-xl bg-[#b9f42e] px-5 py-3 font-semibold text-black disabled:opacity-40">Connect my account</button>
        <button name="decision" value="deny" className="rounded-xl border border-white/20 px-5 py-3">Cancel</button>
      </form>
    </section> : <Connections endpoint={endpoint} />}
  </main>
}
