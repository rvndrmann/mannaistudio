"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, BookOpen, Loader2 } from "lucide-react"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { hasPremiumAccess, isAdminUser } from "@/lib/membership"

type Course={id:string;title:string;description:string;thumbnail:string;level:string;chapters:number;duration:string;price:string|number}
export default function MyCoursesPage(){
  const {user,signInWithGoogle}=useAuth()
  const [courses,setCourses]=useState<Course[]>([])
  const [progress,setProgress]=useState<Record<string,number[]>>({})
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    let active=true
    const load=async()=>{
      if(!user){setLoading(false);return}
      const supabase=createClient()
      const [enrollments,profile,admin,progressRows]=await Promise.all([
        supabase.from("enrollments").select("course_id,status").eq("profile_id",user.id).eq("status","active"),
        supabase.from("profiles").select("membership_status,membership_expires_at").eq("id",user.id).maybeSingle(),
        isAdminUser(supabase,user.id),
        supabase.from("course_progress").select("course_id,completed_chapters").eq("profile_id",user.id),
      ])
      const ids=(enrollments.data||[]).map(row=>row.course_id)
      let courseRows:Course[]=[]
      if(ids.length){const {data}=await supabase.from("courses").select("*").in("id",ids).eq("is_published",true);courseRows=(data||[]) as Course[]}
      if(hasPremiumAccess(profile.data,admin)){
        const {data}=await supabase.from("courses").select("*").eq("is_published",true).eq("is_paused",false)
        const byId=new Map(courseRows.map(course=>[course.id,course]));(data||[]).forEach(course=>byId.set(course.id,course));courseRows=Array.from(byId.values())
      }
      if(!active)return
      setCourses(courseRows)
      setProgress(Object.fromEntries((progressRows.data||[]).map(row=>[row.course_id,row.completed_chapters||[]])))
      setLoading(false)
    }
    void load().catch(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[user])
  return <main className="min-h-screen bg-[#070807] text-white"><Navbar/><section className="mx-auto max-w-7xl px-5 pb-20 pt-32 sm:px-8"><p className="text-xs font-semibold tracking-[.2em] text-primary">STUDENT DASHBOARD</p><h1 className="mt-3 text-4xl font-semibold">My Courses</h1><p className="mt-3 text-white/55">Pick up where you left off and keep building your AI video practice.</p>
    {loading?<div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary"/></div>:!user?<div className="mt-8 rounded-xl border border-white/10 p-8 text-center"><p className="text-white/60">Sign in to view your courses and progress.</p><button onClick={()=>signInWithGoogle()} className="mt-5 rounded-lg bg-primary px-5 py-3 font-semibold text-black">Sign in</button></div>:courses.length===0?<div className="mt-8 rounded-xl border border-white/10 p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-primary"/><p className="mt-4 text-white/60">You haven&apos;t enrolled in a course yet.</p><Link href="/courses" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-black">Explore Courses <ArrowRight className="h-4 w-4"/></Link></div>:<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map(course=>{const chapters=progress[course.id]||[];const percent=Math.min(100,Math.round(chapters.length/Math.max(1,course.chapters)*100));return <Link key={course.id} href={`/courses/${course.id}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] hover:border-primary/40">{course.thumbnail&&<img src={course.thumbnail} alt="" className="aspect-video w-full object-cover"/>}<div className="p-5"><p className="text-xs text-white/45">{course.level} · {chapters.length}/{course.chapters} chapters</p><h2 className="mt-2 text-lg font-semibold">{course.title}</h2><p className="mt-2 line-clamp-2 text-sm text-white/50">{course.description}</p><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary" style={{width:`${percent}%`}}/></div><p className="mt-2 text-xs text-white/45">{percent}% complete · {course.duration}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Continue learning <ArrowRight className="h-4 w-4"/></span></div></Link>})}</div>}
  </section></main>
}
