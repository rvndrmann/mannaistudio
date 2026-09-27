import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

const schema = z.object({ name:z.string().trim().min(1).max(200),subject:z.string().trim().min(1).max(300),message:z.string().trim().min(1).max(10000),topic:z.enum(["general","studio-access","coaching"]).default("general") })
export async function GET(){
  try{
    const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser()
    if(!user) return NextResponse.json({submitted:false})
    const admin=createServiceClient()
    const {data,error}=await admin.from("contact_requests").select("id,status").eq("profile_id",user.id).eq("topic","studio-access").limit(1).maybeSingle()
    if(error) throw error
    return NextResponse.json({submitted:Boolean(data),status:data?.status||null})
  }catch{return NextResponse.json({submitted:false})}
}
export async function POST(request:NextRequest){
  try {
    const supabase=await createClient()
    const {data:{user}}=await supabase.auth.getUser()
    if(!user?.email)return NextResponse.json({error:"Sign in to submit a request."},{status:401})
    const parsed=schema.safeParse(await request.json().catch(()=>null))
    if(!parsed.success)return NextResponse.json({error:"Please complete your name, subject and message."},{status:400})
    const admin=createServiceClient()
    if(parsed.data.topic === "studio-access"){
      const {data:existing,error:existingError}=await admin.from("contact_requests").select("id,status").eq("profile_id",user.id).eq("topic","studio-access").limit(1).maybeSingle()
      if(existingError) throw existingError
      if(existing) return NextResponse.json({success:true,alreadySubmitted:true,status:existing.status})
    }
    const {count,error:countError}=await admin.from("contact_requests").select("id",{count:"exact",head:true}).eq("profile_id",user.id).gte("created_at",new Date(Date.now()-60000).toISOString())
    if(countError)throw countError
    if((count||0)>=3)return NextResponse.json({error:"Please wait a minute before submitting another request."},{status:429})
    const {error}=await admin.from("contact_requests").insert({...parsed.data,profile_id:user.id,email:user.email})
    if(error?.code==='23505' && parsed.data.topic==='studio-access')return NextResponse.json({success:true,alreadySubmitted:true})
    if(error)throw error
    return NextResponse.json({success:true})
  }catch{return NextResponse.json({error:"Could not save your request. Please try again."},{status:500})}
}
