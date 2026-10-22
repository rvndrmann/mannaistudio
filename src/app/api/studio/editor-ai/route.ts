import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { editorAiConnection } from "@/lib/studio/editor-ai-server"

export const dynamic = "force-dynamic"

/**
 * Whether the Timeline editor's AI can run on one of the user's saved keys,
 * and on which model. Names the provider only; the key never leaves the vault.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json(await editorAiConnection(user.id))
  } catch (error) {
    console.error("[editor-ai] Could not read the user's keys:", error)
    return NextResponse.json({ connected: false, reason: "Your API keys could not be checked. Try again shortly." })
  }
}
