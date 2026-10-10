import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isAdminUser } from "@/lib/membership"

async function isAuthorizedAdmin() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  return Boolean(user && await isAdminUser(client, user.id))
}

async function getTestUserIds() {
  const { data, error } = await createServiceClient().from("site_settings")
    .select("value").eq("key", "byok_test_access").maybeSingle()
  if (error) throw error
  const value = data?.value as { userIds?: unknown } | null
  return Array.isArray(value?.userIds) ? value.userIds.filter((id): id is string => typeof id === "string") : []
}

async function saveTestUserIds(userIds: string[]) {
  const { error } = await createServiceClient().from("site_settings").upsert(
    { key: "byok_test_access", value: { userIds: Array.from(new Set(userIds)) } },
    { onConflict: "key" },
  )
  if (error) throw error
}

export async function GET() {
  if (!await isAuthorizedAdmin()) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  try {
    const userIds = await getTestUserIds()
    if (!userIds.length) return NextResponse.json({ users: [] }, { headers: { "Cache-Control": "no-store" } })
    const { data, error } = await createServiceClient().from("profiles").select("id,email").in("id", userIds)
    if (error) throw error
    return NextResponse.json({ users: data || [] }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load BYOK test access" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!await isAuthorizedAdmin()) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  const parsed = z.object({ email: z.string().email().max(320) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid account email." }, { status: 400 })
  try {
    const client = createServiceClient()
    const email = parsed.data.email.trim().toLowerCase()
    const { data: profile, error } = await client.from("profiles").select("id").ilike("email", email).maybeSingle()
    if (error) throw error
    if (!profile) return NextResponse.json({ error: "No account found for that email." }, { status: 404 })
    await saveTestUserIds([...(await getTestUserIds()), profile.id])
    return NextResponse.json({ granted: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not grant BYOK test access" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!await isAuthorizedAdmin()) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid account." }, { status: 400 })
  try {
    await saveTestUserIds((await getTestUserIds()).filter((id) => id !== parsed.data.userId))
    return NextResponse.json({ revoked: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke BYOK test access" }, { status: 500 })
  }
}
