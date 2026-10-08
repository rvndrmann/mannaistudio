"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, BookOpen, Loader2, Sparkles } from "lucide-react"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { hasAllCoursesAccess, hasPremiumAccess, isAdminUser } from "@/lib/membership"
import { isFreeCourse } from "@/lib/course-price"
import { CourseHighlights } from "@/components/courses/CourseHighlights"
import CoachingOfferCard from "@/components/home/CoachingOfferCard"
import CourseDigitalProducts from "@/components/courses/CourseDigitalProducts"
import AllAccessSubscriptionCard from "@/components/AllAccessSubscriptionCard"
import StudioCreditOffer from "@/components/studio/StudioCreditOffer"

type Course={id:string;title:string;description:string;thumbnail:string;level:string;chapters:number;duration:string;price:string|number;sort_order?:number;highlights?:string[]}
const byCourseOrder=(a:Course,b:Course)=>(a.sort_order??1000000)-(b.sort_order??1000000)
export default function MyCoursesPage(){
  const {user,signInWithGoogle}=useAuth()
  const [courses,setCourses]=useState<Course[]>([])
  const [availableCourses,setAvailableCourses]=useState<Course[]>([])
  const [progress,setProgress]=useState<Record<string,number[]>>({})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)
  const [studioAccess,setStudioAccess]=useState<{entitled:boolean;purchaseOnly:boolean;purchaseWindowExpiresAt:string|null}>({entitled:false,purchaseOnly:false,purchaseWindowExpiresAt:null})
  const [studioRequestStatus,setStudioRequestStatus]=useState<string|null>(null)
  const [studioRequestBusy,setStudioRequestBusy]=useState(false)
  const [studioRequestError,setStudioRequestError]=useState("")
  useEffect(()=>{
    let active=true
    const load=async()=>{
      if(!user){setLoading(false);return}
      setLoading(true)
      setError(null)
      const supabase=createClient()
      const [enrollments,profile,admin,allCourseAccess,progressRows]=await Promise.all([
        supabase.from("enrollments").select("course_id,status").eq("profile_id",user.id).eq("status","active"),
        supabase.from("profiles").select("membership_status,membership_expires_at").eq("id",user.id).maybeSingle(),
        isAdminUser(supabase,user.id),
        hasAllCoursesAccess(supabase,user.id),
        supabase.from("course_progress").select("course_id,completed_chapters").eq("profile_id",user.id),
      ])
      const ids=(enrollments.data||[]).map(row=>row.course_id)
      if(enrollments.error)throw new Error(enrollments.error.message)
      if(profile.error)throw new Error(profile.error.message)
      if(progressRows.error)throw new Error(progressRows.error.message)
      const {data:catalog,error:catalogError}=await supabase.from("courses").select("*").eq("is_published",true).eq("is_paused",false).order("sort_order",{ascending:true}).order("created_at",{ascending:true})
      if(catalogError)throw new Error(catalogError.message)
      let courseRows:Course[]=[]
      if(ids.length){const {data,error:courseError}=await supabase.from("courses").select("*").in("id",ids).eq("is_published",true);if(courseError)throw new Error(courseError.message);courseRows=(data||[]) as Course[]}
      if(hasPremiumAccess(profile.data,admin)||allCourseAccess){
        const {data,error:courseError}=await supabase.from("courses").select("*").eq("is_published",true).eq("is_paused",false)
        if(courseError)throw new Error(courseError.message)
        const byId=new Map(courseRows.map(course=>[course.id,course]));(data||[]).forEach(course=>byId.set(course.id,course));courseRows=Array.from(byId.values())
      }
      if(!active)return
      setCourses(courseRows.sort(byCourseOrder))
      setAvailableCourses(((catalog||[]) as Course[]).filter(course=>!courseRows.some(owned=>owned.id===course.id)).sort(byCourseOrder))
      setProgress(Object.fromEntries((progressRows.data||[]).map(row=>[row.course_id,row.completed_chapters||[]])))
      setLoading(false)
    }
    void load().catch(err=>{if(active){setError(err instanceof Error?err.message:"Could not load your courses.");setLoading(false)}})
    return()=>{active=false}
  },[user])

  useEffect(()=>{
    if(!user){setStudioAccess({entitled:false,purchaseOnly:false,purchaseWindowExpiresAt:null});setStudioRequestStatus(null);return}
    let active=true
    Promise.all([
      fetch("/api/entitlements/creator-studio",{cache:"no-store"}).then(response=>response.ok?response.json():{entitled:false}),
      fetch("/api/contact?topic=studio-access",{cache:"no-store"}).then(response=>response.json()),
    ]).then(([access,request])=>{
      if(!active)return
      setStudioAccess({entitled:Boolean(access.entitled),purchaseOnly:Boolean(access.purchaseOnly),purchaseWindowExpiresAt:access.purchaseWindowExpiresAt||null})
      setStudioRequestStatus(request.status||null)
    }).catch(()=>{
      if(active){setStudioAccess({entitled:false,purchaseOnly:false,purchaseWindowExpiresAt:null});setStudioRequestStatus(null)}
    })
    return()=>{active=false}
  },[user])

  const requestStudioInvitation=async()=>{
    if(!user){signInWithGoogle("/my-courses");return}
    setStudioRequestBusy(true)
    setStudioRequestError("")
    try{
      const response=await fetch("/api/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split("@")[0]||"User",subject:"Creator Studio access request",message:"Please review my request for Creator Studio access from My Courses.",topic:"studio-access"})})
      const result=await response.json()
      if(!response.ok)throw new Error(result.error||"Could not submit your request.")
      const latest=await fetch("/api/contact?topic=studio-access",{cache:"no-store"}).then(res=>res.json())
      setStudioRequestStatus(latest.status||result.status||"pending")
    }catch(err){setStudioRequestError(err instanceof Error?err.message:"Could not submit your request.")}
    finally{setStudioRequestBusy(false)}
  }
  if(error)return <main className="min-h-screen bg-[#070807] text-white"><Navbar/><section className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-8 sm:pb-20 sm:pt-32"><h1 className="text-3xl font-semibold sm:text-4xl">My Courses</h1><div role="alert" className="mt-6 rounded-xl border border-red-400/30 p-5 sm:mt-8 sm:p-8"><p>Could not load your courses. Please try again.</p><p className="mt-2 break-words text-sm text-white/55">{error}</p><button onClick={()=>window.location.reload()} className="mt-4 min-h-11 rounded-lg bg-primary px-5 py-3 font-semibold text-black">Retry</button></div></section></main>
  return <main className="min-h-screen bg-[#070807] text-white"><Navbar/><section className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-8 sm:pb-20 sm:pt-32"><p className="text-xs font-semibold tracking-[.2em] text-primary">STUDENT DASHBOARD</p><h1 className="mt-3 text-3xl font-semibold sm:text-4xl">My Courses</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">Pick up where you left off and keep building your AI video practice.</p>
    {loading?<div className="flex justify-center py-16 sm:py-20"><Loader2 className="animate-spin text-primary"/></div>:!user?<div className="mt-6 rounded-xl border border-white/10 p-5 text-center sm:mt-8 sm:p-8"><p className="text-white/60">Sign in to view your courses and progress.</p><button onClick={()=>signInWithGoogle()} className="mt-5 min-h-11 rounded-lg bg-primary px-5 py-3 font-semibold text-black">Sign in</button></div>:courses.length===0?<div className="mt-6 rounded-xl border border-white/10 p-5 text-center sm:mt-8 sm:p-8"><BookOpen className="mx-auto h-8 w-8 text-primary"/><p className="mt-4 text-white/60">You haven&apos;t enrolled in a course yet.</p></div>:<div className="mt-6 grid gap-4 sm:mt-8 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map(course=>{const chapters=progress[course.id]||[];const percent=Math.min(100,Math.round(chapters.length/Math.max(1,course.chapters)*100));return <Link key={course.id} href={`/courses/${course.id}`} className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] hover:border-primary/40">{course.thumbnail&&<img src={course.thumbnail} alt="" className="aspect-video w-full object-cover"/>}<div className="p-4 sm:p-5"><p className="text-xs text-white/45">{course.level} · {chapters.length}/{course.chapters} chapters</p><h2 className="mt-2 break-words text-lg font-semibold">{course.title}</h2><CourseHighlights highlights={course.highlights} description={course.description}/><p className="mt-4 text-base font-semibold text-primary sm:text-lg">{isFreeCourse(course.price) ? "Free" : "Included in Pro · ₹799/month"}</p><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary" style={{width:`${percent}%`}}/></div><p className="mt-2 text-xs text-white/45">{percent}% complete · {course.duration}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Continue learning <ArrowRight className="h-4 w-4"/></span></div></Link>})}</div>}
    <section className="mt-6 flex flex-col items-stretch gap-3 sm:mt-8 sm:items-end">
        {!user ? (
          <button type="button" onClick={()=>signInWithGoogle("/my-courses")} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black transition hover:bg-primary/90 sm:w-auto"><Sparkles className="h-4 w-4"/> Request an Invitation</button>
        ) : studioAccess.entitled && !studioAccess.purchaseOnly ? (
          <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-center text-sm font-semibold text-primary"><Sparkles className="h-4 w-4 shrink-0"/> Creator Studio access active</span>
        ) : studioRequestStatus==="pending" ? (
          <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-4 py-2 text-center text-sm font-medium text-white/70">Invitation request pending</span>
        ) : studioRequestStatus==="resolved" && !studioAccess.purchaseOnly ? (
          <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-4 py-2 text-center text-sm font-medium text-white/70">Request reviewed · contact the team for help</span>
        ) : (
          <button type="button" onClick={()=>void requestStudioInvitation()} disabled={studioRequestBusy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black transition hover:bg-primary/90 disabled:opacity-60 sm:w-auto"><Sparkles className="h-4 w-4"/>{studioRequestBusy?"Sending…":"Request an Invitation"}</button>
        )}
      {studioAccess.purchaseOnly&&studioAccess.purchaseWindowExpiresAt&&<div className="w-full"><StudioCreditOffer expiresAt={studioAccess.purchaseWindowExpiresAt} onPurchased={()=>{void fetch("/api/entitlements/creator-studio",{cache:"no-store"}).then(res=>res.json()).then(access=>setStudioAccess({entitled:Boolean(access.entitled),purchaseOnly:Boolean(access.purchaseOnly),purchaseWindowExpiresAt:access.purchaseWindowExpiresAt||null}))}}/></div>}
      {studioRequestError&&<p role="alert" className="w-full text-left text-sm text-red-300 sm:text-right">{studioRequestError}</p>}
    </section>
    <AllAccessSubscriptionCard />
    {user&&availableCourses.length>0&&<section className="mt-12 sm:mt-16"><div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end sm:gap-4"><div><p className="text-xs font-semibold tracking-[.2em] text-primary">COURSE CATALOG</p><h2 className="mt-2 text-xl font-semibold sm:text-2xl">Explore more courses</h2><p className="mt-2 text-sm leading-6 text-white/50">Get every published course with AI Director Hub Pro for ₹799/month.</p></div><Link href="/courses" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary">View full catalog <ArrowRight className="h-4 w-4"/></Link></div><div className="mt-5 grid gap-4 sm:mt-6 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">{availableCourses.map(course=><Link key={course.id} href={`/courses/${course.id}`} className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] transition hover:border-primary/40">{course.thumbnail&&<img src={course.thumbnail} alt="" className="aspect-video w-full object-cover"/>}<div className="p-4 sm:p-5"><p className="text-xs text-white/45">{course.level} · {course.chapters} chapters</p><h3 className="mt-2 break-words text-lg font-semibold">{course.title}</h3><CourseHighlights highlights={course.highlights} description={course.description}/><p className="mt-4 text-lg font-semibold text-primary">{isFreeCourse(course.price) ? "Free" : "Included in Pro · ₹799/month"}</p><span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">{isFreeCourse(course.price)?"Enroll free":"Included in Pro"}<ArrowRight className="h-4 w-4"/></span></div></Link>)}</div></section>}
    {user&&<div className="mt-12 space-y-8"><CoachingOfferCard/><CourseDigitalProducts/></div>}
  </section></main>
}
