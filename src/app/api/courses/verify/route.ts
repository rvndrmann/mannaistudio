import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { z,ZodError } from "zod"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

const schema=z.object({razorpay_order_id:z.string().min(1).max(200),razorpay_payment_id:z.string().min(1).max(200),razorpay_signature:z.string().min(1).max(500)}).strict()

export async function POST(request:NextRequest) {
  try {
    const keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET
    if(!keyId||!keySecret)return NextResponse.json({error:"Payments are not configured."},{status:503})
    const supabase=await createClient()
    const {data:{user}}=await supabase.auth.getUser()
    if(!user)return NextResponse.json({error:"Unauthorized"},{status:401})
    const input=schema.parse(await request.json())
    const expected=crypto.createHmac("sha256",keySecret).update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`).digest("hex")
    const provided=Buffer.from(input.razorpay_signature),expectedBytes=Buffer.from(expected)
    if(provided.length!==expectedBytes.length||!crypto.timingSafeEqual(provided,expectedBytes))return NextResponse.json({error:"Invalid payment signature."},{status:400})
    const razorpay=new Razorpay({key_id:keyId,key_secret:keySecret})
    const [order,payment]=await Promise.all([razorpay.orders.fetch(input.razorpay_order_id),razorpay.payments.fetch(input.razorpay_payment_id)])
    const notes=(order.notes||{}) as Record<string,string>
    if(notes.type!=="course"||notes.profile_id!==user.id)return NextResponse.json({error:"This order does not belong to your account."},{status:403})
    if(payment.order_id!==input.razorpay_order_id||!(["captured","authorized"].includes(payment.status||""))||Number(payment.amount)!==Number(order.amount))return NextResponse.json({error:"Payment could not be verified."},{status:400})
    const admin=createServiceClient()
    const {data:course}=await admin.from("courses").select("id,title,is_published,is_paused,grants_creator_studio,creator_studio_access_days").eq("id",notes.course_id).maybeSingle()
    if(!course||!course.is_published||course.is_paused)return NextResponse.json({error:"The course is no longer available. Contact support for help."},{status:409})
    const {error:enrollError}=await admin.from("enrollments").upsert({profile_id:user.id,course_id:course.id,status:"active",payment_id:input.razorpay_payment_id},{onConflict:"profile_id,course_id"})
    if(enrollError)return NextResponse.json({error:`Payment verified, but enrollment failed: ${enrollError.message}`},{status:500})
    if(course.grants_creator_studio){const days=Number(course.creator_studio_access_days)||null;const expires_at=days?new Date(Date.now()+days*86400000).toISOString():null;await admin.from("user_entitlements").upsert({profile_id:user.id,entitlement_key:"creator_studio_access",source_type:"course_purchase",source_id:input.razorpay_payment_id,expires_at},{onConflict:"profile_id,entitlement_key,source_type,source_id"})}
    const {data:includedProducts}=await admin.from("digital_products").select("id,access_days,grants_creator_studio").eq("active",true).contains("included_with_course",[course.id])
    for(const product of includedProducts||[]){const days=Number(product.access_days)||null;const expires_at=days?new Date(Date.now()+days*86400000).toISOString():null;await admin.from("user_entitlements").upsert({profile_id:user.id,entitlement_key:`digital_product:${product.id}`,source_type:"course_inclusion",source_id:course.id,expires_at},{onConflict:"profile_id,entitlement_key,source_type,source_id"});if(product.grants_creator_studio)await admin.from("user_entitlements").upsert({profile_id:user.id,entitlement_key:"creator_studio_access",source_type:"course_inclusion",source_id:course.id,expires_at},{onConflict:"profile_id,entitlement_key,source_type,source_id"})}
    await admin.rpc("record_payment",{p_email:user.email||"",p_txnid:input.razorpay_payment_id,p_payment_id:input.razorpay_payment_id,p_amount:String(Math.round(Number(payment.amount)/100)),p_product_info:`Course: ${course.title}`,p_status:"success",p_profile_id:user.id})
    return NextResponse.json({success:true,courseId:course.id,message:"Payment successful. Course access is ready."})
  } catch(error) { if(error instanceof ZodError)return NextResponse.json({error:"Invalid payment verification details."},{status:400});return NextResponse.json({error:error instanceof Error?error.message:"Payment verification failed."},{status:500}) }
}
