import { NextRequest,NextResponse } from "next/server"
import Razorpay from "razorpay"
import { createClient } from "@/lib/supabase/server"

export async function POST(request:NextRequest){
  try{
    const keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET
    if(!keyId||!keySecret)return NextResponse.json({error:"Payments are not configured."},{status:503})
    const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser()
    if(!user)return NextResponse.json({error:"Sign in to purchase this product."},{status:401})
    const body=await request.json().catch(()=>({}))
    const {data:product}=await supabase.from("digital_products").select("id,name,price,is_free,active,standalone_purchase").eq("id",body.id).maybeSingle()
    if(!product||!product.active||product.is_free||!product.standalone_purchase)return NextResponse.json({error:"This product is not available for purchase."},{status:404})
    const amount=Math.round(Number(product.price)*100)
    if(!Number.isSafeInteger(amount)||amount<100)return NextResponse.json({error:"The product price is not configured."},{status:400})
    const razorpay=new Razorpay({key_id:keyId,key_secret:keySecret})
    const order=await razorpay.orders.create({amount,currency:"INR",receipt:`product_${user.id.slice(0,8)}_${Date.now()}`,notes:{type:"digital_product",profile_id:user.id,product_id:product.id,product_name:product.name}})
    return NextResponse.json({orderId:order.id,amount:order.amount,keyId,email:user.email||"",name:user.user_metadata?.full_name||"Creator",productName:product.name})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not start product checkout."},{status:500})}
}
