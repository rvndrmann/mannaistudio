import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"
import { createClient } from "@/lib/supabase/server"
import { brandInputSchema } from "@/lib/studio/brand"
import { describeError } from "@/lib/studio/errors"

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null }
  return { supabase, user }
}

export async function GET() {
  try {
    const { supabase, user } = await currentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data, error } = await supabase
      .from("creator_brands")
      .select("id,name,kind,tagline,website_url,industry,logo_path,updated_at,created_at")
      .order("updated_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ brands: data || [] })
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not load brands") }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await currentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const input = brandInputSchema.parse(await request.json())

    const insert = () => supabase.from("creator_brands").insert({ ...input, user_id: user.id }).select("*").single()
    let { data, error } = await insert()
    // A profile row is created by trigger at sign-up, but an account that
    // predates that trigger has none, and the brand's owner reference would
    // fail on a user who is perfectly signed in.
    if (error?.code === "23503") {
      await supabase.from("profiles").upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name || "Creator",
        avatar_url: user.user_metadata?.avatar_url || "",
        email: user.email || "",
      }, { onConflict: "id" })
      ;({ data, error } = await insert())
    }
    if (error) throw error

    return NextResponse.json({ brand: data }, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid brand details", issues: error.flatten() }, { status: 400 })
    return NextResponse.json({ error: describeError(error, "Could not create the brand") }, { status: 400 })
  }
}
