import {NextRequest,NextResponse} from "next/server"
import {createClient} from "@/lib/supabase/server"
import {createServiceClient} from "@/lib/supabase/service"
export async function POST(request:NextRequest){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:"Sign in to access this product."},{status:401})
  const body=await request.json().catch(()=>({}))
  const admin=createServiceClient();const {data:product}=await admin.from("digital_products").select("id,active,is_free,access_days,grants_creator_studio").eq("id",body.id).maybeSingle()
  if(!product||!product.active||!product.is_free)return NextResponse.json({error:"This free product is not available."},{status:404})
  const days=Number(product.access_days)||null
  const entitlement={profile_id:user.id,entitlement_key:`digital_product:${product.id}`,source_type:"free_product",source_id:product.id,expires_at:days?new Date(Date.now()+days*86400000).toISOString():null}
  await admin.from("user_entitlements").upsert(entitlement,{onConflict:"profile_id,entitlement_key,source_type,source_id"})
  if(product.grants_creator_studio)await admin.from("user_entitlements").upsert({...entitlement,entitlement_key:"creator_studio_access"},{onConflict:"profile_id,entitlement_key,source_type,source_id"})
  return NextResponse.json({success:true})
}
