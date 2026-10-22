import { NextRequest, NextResponse } from "next/server"
import { editorAiConnection, userFromBearer } from "@/lib/studio/editor-ai-server"

export const dynamic = "force-dynamic"

/** The editor's model picker: one model per provider the user holds a key for. */
export async function GET(request: NextRequest) {
  const user = await userFromBearer(request)
  if (!user) return NextResponse.json({ error: { message: "Your session has expired. Reload the studio." } }, { status: 401 })
  const connection = await editorAiConnection(user.id)
  return NextResponse.json({
    object: "list",
    data: connection.connected ? connection.models.map((id) => ({ id, object: "model", owned_by: "you" })) : [],
  })
}
