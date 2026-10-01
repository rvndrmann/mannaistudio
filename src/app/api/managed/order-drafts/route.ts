import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { managedBriefSchema, managedServiceKeySchema } from "@/lib/managed-brief"
import { requireUser, managedServiceOpen, managedErrorMessage, managedErrorStatus } from "@/lib/managed/server"
import { loadCatalogue } from "@/lib/managed/catalogue"
import { packageFromCatalogue, serviceFromCatalogue } from "@/lib/managed-offers"
import { mcpOrigin } from "@/lib/studio/mcp/config"
import { oauthRateLimit } from "@/lib/studio/mcp/oauth"
export const dynamic = "force-dynamic"
export const orderDraftSchema = z.object({ serviceType: managedServiceKeySchema, packageKey: z.string().trim().min(1).max(80), brief: managedBriefSchema }).strict()
export async function POST(request: NextRequest) {
 try {
  const { supabase, user } = await requireUser(request, "managed:orders")
  await oauthRateLimit(request, `managed-draft:${user.id}`, 10)
  const input = orderDraftSchema.parse(await request.json())
  if (!await managedServiceOpen(supabase)) return NextResponse.json({ error: "We are not taking new projects right now." }, { status: 403 })
  const catalogue = await loadCatalogue(supabase)
  const service = serviceFromCatalogue(catalogue, input.serviceType)
  if (!service?.isPublished || service.quoteOnly) return NextResponse.json({ error: "Choose a published service with a checkout package." }, { status: 400 })
  const resolved = packageFromCatalogue(catalogue, input.serviceType, input.packageKey)
  if (!resolved?.option.isPublished) return NextResponse.json({ error: "Choose an available package from the catalogue." }, { status: 400 })
  if (!input.brief.brandName && !input.brief.productName && !input.brief.productDescription) return NextResponse.json({ error: "Describe the brand or product in your brief." }, { status: 400 })
  if (input.brief.attachments.some(a => !a.path.startsWith(`${user.id}/`))) return NextResponse.json({ error: "Attachments must belong to your account. You can upload files at checkout." }, { status: 400 })
  const { data, error } = await supabase.from("managed_order_drafts").insert({ user_id: user.id, service_type: input.serviceType, package_key: input.packageKey, brief: input.brief }).select("id").single()
  if (error) throw error
  return NextResponse.json({ draftId: data.id, checkoutUrl: `${mcpOrigin()}/hire-us/brief?draft=${data.id}`, serviceName: service.name, packageName: resolved.option.name, priceInr: resolved.option.priceInr, paymentStatus: "not_started", message: "Brief saved. Open the checkout link, sign in to the same account, review the brief and current price, then pay. Production starts after payment verification. The paid order will appear in your hired-team projects." }, { status: 201 })
 } catch (error) {
  return NextResponse.json({ error: error instanceof ZodError ? "Invalid order brief" : managedErrorMessage(error,"Could not save the order brief") }, { status: error instanceof ZodError ? 400 : managedErrorStatus(error) })
 }
}
