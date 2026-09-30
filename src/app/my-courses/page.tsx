"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, BookOpen, Loader2 } from "lucide-react"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { hasAllCoursesAccess, hasPremiumAccess, isAdminUser } from "@/lib/membership"
import { isFreeCourse } from "@/lib/course-price"
import { CourseHighlights } from "@/components/courses/CourseHighlights"
import CoachingOfferCard from "@/components/home/CoachingOfferCard"
import CourseDigitalProducts from "@/components/courses/CourseDigitalProducts"
import { formatUsd } from "@/lib/currency"

type Course={id:string;title:string;description:string;thumbnail:string;level:string;chapters:number;duration:string;price:string|number;sort_order?:number;highlights?:string[]}
const byCourseOrder=(a:Course,b:Course)=>(a.sort_order??1000000)-(b.sort_order??1000000)
export default function MyCoursesPage(){
  const {user,signInWithGoogle}=useAuth()
  const [courses,setCourses]=useState<Course[]>([])
  const [availableCourses,setAvailableCourses]=useState<Course[]>([])
  const [progress,setProgress]=useState<Record<string,number[]>>({})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState<string|null>(null)
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
  if(error)return <main className="min-h-screen bg-[#070807] text-white"><Navbar/><section className="mx-auto max-w-7xl px-5 pb-20 pt-32"><h1 className="text-4xl font-semibold">My Courses</h1><div role="alert" className="mt-8 rounded-xl border border-red-400/30 p-8"><p>Could not load your courses. Please try again.</p><p className="mt-2 text-sm text-white/55">{error}</p><button onClick={()=>window.location.reload()} className="mt-4 rounded-lg bg-primary px-5 py-3 font-semibold text-black">Retry</button></div></section></main>
  return <main className="min-h-screen bg-[#070807] text-white"><Navbar/><section className="mx-auto max-w-7xl px-5 pb-20 pt-32 sm:px-8"><p className="text-xs font-semibold tracking-[.2em] text-primary">STUDENT DASHBOARD</p><h1 className="mt-3 text-4xl font-semibold">My Courses</h1><p className="mt-3 text-white/55">Pick up where you left off and keep building your AI video practice.</p>
    {loading?<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary"/></div>:!user?<div className="mt-8 rounded-xl border border-white/10 p-8 text-center"><p className="text-white/60">Sign in to view your courses and progress.</p><button onClick={()=>signInWithGoogle()} className="mt-5 rounded-lg bg-primary px-5 py-3 font-semibold text-black">Sign in</button></div>:courses.length===0?<div className="mt-8 rounded-xl border border-white/10 p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-primary"/><p className="mt-4 text-white/60">You haven&apos;t enrolled in a course yet.</p></div>:<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map(course=>{const chapters=progress[course.id]||[];const percent=Math.min(100,Math.round(chapters.length/Math.max(1,course.chapters)*100));return <Link key={course.id} href={`/courses/${course.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] hover:border-primary/40">{course.thumbnail&&<img src={course.thumbnail} alt="" className="aspect-video w-full object-cover"/>}<div className="p-5"><p className="text-xs text-white/45">{course.level} · {chapters.length}/{course.chapters} chapters</p><h2 className="mt-2 text-lg font-semibold">{course.title}</h2><CourseHighlights highlights={course.highlights} description={course.description}/><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary" style={{width:`${percent}%`}}/></div><p className="mt-2 text-xs text-white/45">{percent}% complete · {course.duration}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Continue learning <ArrowRight className="h-4 w-4"/></span></div></Link>})}</div>}
    {user&&availableCourses.length>0&&<section className="mt-16"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold tracking-[.2em] text-primary">COURSE CATALOG</p><h2 className="mt-2 text-2xl font-semibold">Explore more courses</h2><p className="mt-2 text-sm text-white/50">Browse published courses and open one to enroll or purchase.</p></div><Link href="/courses" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">View full catalog <ArrowRight className="h-4 w-4"/></Link></div><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{availableCourses.map(course=><Link key={course.id} href={`/courses/${course.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] transition hover:border-primary/40">{course.thumbnail&&<img src={course.thumbnail} alt="" className="aspect-video w-full object-cover"/>}<div className="p-5"><p className="text-xs text-white/45">{course.level} · {course.chapters} chapters</p><h3 className="mt-2 text-lg font-semibold">{course.title}</h3><CourseHighlights highlights={course.highlights} description={course.description}/><p className="mt-4 text-lg font-semibold text-primary">{isFreeCourse(course.price) ? "Free" : /^\d+(\.\d+)?$/.test(String(course.price).trim()) ? formatUsd(Number(course.price)) : String(course.price)}</p><span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary">{isFreeCourse(course.price)?"Enroll free":"View course"}<ArrowRight className="h-4 w-4"/></span></div></Link>)}</div></section>}
    {user&&<div className="mt-12 space-y-8"><CoachingOfferCard/><CourseDigitalProducts/></div>}
  </section></main>
}
