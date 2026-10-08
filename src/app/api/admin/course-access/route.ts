import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isAdminUser } from "@/lib/membership"
import { isFreeCourse } from "@/lib/course-price"

export async function GET() {
 const client = await createClient()
 const { data: { user } } = await client.auth.getUser()
 if (!user || !await isAdminUser(client,user.id)) return NextResponse.json({error:"Admin access required"},{status:403})
 const db=createServiceClient()
 const results=await Promise.all([
  db.from("enrollments").select("profile_id,course_id,status,payment_id"),
  db.from("payments").select("profile_id,payment_id,status,amount"),
  db.from("all_access_subscriptions").select("profile_id,paid_until"),
  db.from("courses").select("id,price,is_published,is_paused"),
  db.from("admin_users").select("id"),
 ])
 if(results.some(r=>r.error)) return NextResponse.json({error:"Could not verify course access"},{status:503})
 const [enrollments,payments,subscriptions,courses,admins]=results
 const paid=new Set((payments.data||[]).filter(p=>["success","paid","captured"].includes(String(p.status).toLowerCase())&&Number(p.amount)>0).map(p=>`${p.profile_id}:${p.payment_id}`))
 const periods:Record<string,string>={}
 for(const s of subscriptions.data||[]) if(s.paid_until && (!periods[s.profile_id]||Date.parse(s.paid_until)>Date.parse(periods[s.profile_id]))) periods[s.profile_id]=s.paid_until
 const adminIds=new Set((admins.data||[]).map(a=>a.id))
 const catalog=new Map((courses.data||[]).map(c=>[c.id,c]))
 const access:Record<string,string>={}
 for(const e of enrollments.data||[]) {
  const c=catalog.get(e.course_id), end=periods[e.profile_id]
  const label=adminIds.has(e.profile_id)?"Admin access":!c?.is_published||c.is_paused?"Unavailable":isFreeCourse(c.price)?"Free access":e.status==="active"&&paid.has(`${e.profile_id}:${e.payment_id}`)?"Purchased":end&&Date.parse(end)>Date.now()?"Subscription active":end?"Subscription expired · Locked":"Unpaid · Locked"
  access[`${e.profile_id}:${e.course_id}`]=label
 }
 return NextResponse.json({access,periods},{headers:{"Cache-Control":"private, no-store"}})
}
