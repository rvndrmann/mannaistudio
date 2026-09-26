import {NextRequest,NextResponse} from "next/server"
import crypto from "node:crypto"
import {z,ZodError} from "zod"
import Razorpay from "razorpay"
import {createClient} from "@/lib/supabase/server"
import {createServiceClient} from "@/lib/supabase/service"

const schema=z.object({razorpay_order_id:z.string().min(1).max(200),razorpay_payment_id:z.string().min(1).max(200),razorpay_signature:z.string().min(1).max(500)}).strict()
export async function POST(request:NextRequest){
  try{
    const keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET
    if(!keyId||!keySecret)return NextResponse.json({error:"Payments are not configured."},{status:503})
    const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser()
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401})
    const input=schema.parse(await request.json())
    const expected=crypto.createHmac("sha256",keySecret).update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`).digest("hex")
    const provided=Buffer.from(input.razorpay_signature),expectedBytes=Buffer.from(expected)
    if(provided.length!==expectedBytes.length||!crypto.timingSafeEqual(provided,expectedBytes))return NextResponse.json({error:"Invalid payment signature."},{status:400})
    const razorpay=new Razorpay({key_id:keyId,key_secret:keySecret})
    const [order,payment]=await Promise.all([razorpay.orders.fetch(input.razorpay_order_id),razorpay.payments.fetch(input.razorpay_payment_id)])
    const notes=(order.notes||{}) as Record<string,string>
    if(notes.type!=="digital_product"||notes.profile_id!==user.id)return NextResponse.json({error:"This order does not belong to your account."},{status:403})
    if(payment.order_id!==input.razorpay_order_id||!(["captured","authorized"].includes(payment.status||""))||Number(payment.amount)!==Number(order.amount))return NextResponse.json({error:"Payment could not be verified."},{status:400})
    const admin=createServiceClient()
    const {data:product}=await admin.from("digital_products").select("id,name,active,grants_creator_studio,access_days").eq("id",notes.product_id).maybeSingle()
    if(!product||!product.active)return NextResponse.json({error:"This product is no longer available."},{status:409})
    const paidAmount=Number(payment.amount)/100
    const {error:purchaseError}=await admin.from("digital_product_purchases").upsert({profile_id:user.id,product_id:product.id,payment_id:input.razorpay_payment_id,amount:paidAmount},{onConflict:"payment_id"})
    if(purchaseError)return NextResponse.json({error:`Payment verified, but product access failed: ${purchaseError.message}`},{status:500})
    const days=Number(product.access_days)||null
    const entitlement={profile_id:user.id,entitlement_key:`digital_product:${product.id}`,source_type:"product_purchase",source_id:input.razorpay_payment_id,expires_at:days?new Date(Date.now()+days*86400000).toISOString():null}
    await admin.from("user_entitlements").upsert(entitlement,{onConflict:"profile_id,entitlement_key,source_type,source_id"})
    if(product.grants_creator_studio)await admin.from("user_entitlements").upsert({...entitlement,entitlement_key:"creator_studio_access"},{onConflict:"profile_id,entitlement_key,source_type,source_id"})
    await admin.rpc("record_payment",{p_email:user.email||"",p_txnid:input.razorpay_payment_id,p_payment_id:input.razorpay_payment_id,p_amount:String(paidAmount),p_product_info:`Digital Product: ${product.name}`,p_status:"success",p_profile_id:user.id})
    return NextResponse.json({success:true,productId:product.id,message:"Payment successful. Product access is ready."})
  }catch(error){if(error instanceof ZodError)return NextResponse.json({error:"Invalid payment verification details."},{status:400});return NextResponse.json({error:error instanceof Error?error.message:"Payment verification failed."},{status:500})}
}
