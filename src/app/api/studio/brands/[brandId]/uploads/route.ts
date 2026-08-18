import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { requireBrandOwner } from "@/lib/studio/brand-server"
import { studioErrorMessage, studioErrorStatus } from "@/lib/studio/server-context"

const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]
const maximumBytes = 20 * 1024 * 1024

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (fromName) return fromName
  if (file.type.includes("jpeg")) return "jpg"
  if (file.type.includes("webp")) return "webp"
  if (file.type.includes("avif")) return "avif"
  return "png"
}

/**
 * Brand images — logos, product shots, character references — land in the same
 * private bucket the studio already uses, under the owner's folder so the
 * existing storage policy covers them without a second set of rules.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params
    const context = await requireBrandOwner(brandId)
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: "Upload a PNG, JPEG, WebP, GIF, or AVIF image." }, { status: 400 })
    if (file.size > maximumBytes) return NextResponse.json({ error: "That image is too large. Maximum size is 20MB." }, { status: 413 })

    const path = `${context.user.id}/brands/${brandId}/${randomUUID()}.${extensionFor(file)}`
    const { error: uploadError } = await context.supabase.storage.from("creator-studio-media").upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { data: signed } = await context.supabase.storage.from("creator-studio-media").createSignedUrl(path, 60 * 60)

    return NextResponse.json({ path, url: signed?.signedUrl || "", name: file.name, contentType: file.type }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: studioErrorMessage(error, "Could not upload the image") }, { status: studioErrorStatus(error) })
  }
}
