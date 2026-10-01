import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireUser, managedErrorMessage, managedErrorStatus } from "@/lib/managed/server"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest, { params }: { params: Promise<{ draftId: string }> }) {
 try {
  const { supabase, user } = await requireUser()
  const { draftId } = await params
  if (!z.string().uuid().safeParse(draftId).success) return NextResponse.json({ error: "Brief not found" }, { status: 404 })
  const { data, error } = await supabase.from("managed_order_drafts").select("id,service_type,package_key,brief").eq("id",draftId).eq("user_id",user.id).maybeSingle()
  if (error) throw error
  if (!data) return NextResponse.json({ error: "Brief not found in this account. Sign in to the account used in your assistant." }, { status: 404 })
  return NextResponse.json({ draft: data }, { headers: { "Cache-Control": "no-store" } })
 } catch (error) { return NextResponse.json({ error: managedErrorMessage(error,"Could not load brief") }, { status: managedErrorStatus(error) }) }
}
