import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isAdminUser } from "@/lib/membership"

async function authorized() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  return Boolean(user && await isAdminUser(client, user.id))
}
export async function GET() {
  if (!await authorized()) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  const { data, error } = await createServiceClient().from("site_settings").select("value").eq("key", "platform_credit_access").maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data?.value || { enabled: false, userIds: [] }, { headers: { "Cache-Control": "no-store" } })
}
export async function PUT(request: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  const result = z.object({ enabled: z.boolean(), userIds: z.array(z.string().uuid()).max(1000) }).safeParse(await request.json())
  if (!result.success) return NextResponse.json({ error: "Enter valid user UUIDs." }, { status: 400 })
  const { error } = await createServiceClient().from("site_settings").upsert({ key: "platform_credit_access", value: result.data }, { onConflict: "key" })
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ saved: true })
}
