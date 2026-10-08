import { NextRequest, NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"

async function legacyPOST(request: NextRequest) {
  try {
    const keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET
    if(!keyId||!keySecret)return NextResponse.json({error:"Payments are not configured."},{status:503})
    const supabase=await createClient()
    const {data:{user}}=await supabase.auth.getUser()
    if(!user)return NextResponse.json({error:"Sign in to purchase this course."},{status:401})
    const body=await request.json().catch(()=>({}))
    if(typeof body.courseId!=="string")return NextResponse.json({error:"Course is required."},{status:400})
    const {data:course,error}=await supabase.from("courses").select("id,title,price,is_published,is_paused").eq("id",body.courseId).maybeSingle()
    if(error||!course||!course.is_published||course.is_paused)return NextResponse.json({error:"This course is not available."},{status:404})
    const price=Number(course.price)
    if(!Number.isFinite(price)||price<=0)return NextResponse.json({error:"This course does not have a one-time price configured. You can access it with an active membership."},{status:400})
    const razorpay=new Razorpay({key_id:keyId,key_secret:keySecret})
    const order=await razorpay.orders.create({amount:Math.round(price*100),currency:"INR",receipt:`course_${user.id.slice(0,8)}_${Date.now()}`,notes:{type:"course",profile_id:user.id,course_id:course.id,course_title:course.title}})
    return NextResponse.json({orderId:order.id,amount:order.amount,keyId,email:user.email||"",name:user.user_metadata?.full_name||"Creator",courseTitle:course.title})
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Could not start checkout."},{status:500}) }
}

export async function POST() {
  return NextResponse.json({ error: "This offer is currently unavailable. Subscribe to AI Director Hub Pro for ₹799/month.", billingUrl: "/billing" }, { status: 410 })
}
