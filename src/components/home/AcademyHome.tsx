"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, BookOpen, Clapperboard, Film, LockKeyhole, Quote, Sparkles, Video } from "lucide-react"
import Footer from "@/components/Footer"
import ShowcaseReel from "@/components/home/ShowcaseReel"
import Navbar from "@/components/Navbar"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { sortShowcase, toShowcaseVideo, type ShowcaseVideo } from "@/lib/showcase"
import { isFreeCourse } from "@/lib/course-price"
import { formatUsd } from "@/lib/currency"
import { youtubeEmbedUrl } from "@/lib/video-embed"
import CoachingOfferCard from "@/components/home/CoachingOfferCard"

type Course = {
  id: string; title: string; description: string; thumbnail: string; level: string
  chapters: number; duration: string; price: string | number; is_featured?: boolean
}
type AcademyContent = {headline:string;description:string;instructor_name:string;instructor_bio:string;instructor_photo:string;instructor_experience:string;show_showreel:boolean;show_transformation:boolean;show_courses:boolean;show_workflow:boolean;show_products:boolean;show_coaching:boolean;show_creator_studio:boolean;show_student_work:boolean;show_instructor:boolean}
const defaultContent: AcademyContent={headline:"Turn your AI creativity into work clients pay for.",description:"Learn on-demand, make real creative, and get live feedback until your work is good enough to sell — not just good enough to post.",instructor_name:"",instructor_bio:"",instructor_photo:"",instructor_experience:"",show_showreel:true,show_transformation:true,show_courses:true,show_workflow:true,show_products:true,show_coaching:true,show_creator_studio:true,show_student_work:true,show_instructor:true}

const transformations = [
  ["Random prompts", "Intentional shots"],
  ["Inconsistent characters", "Character consistency"],
  ["Generic AI movement", "Controlled cinematography"],
  ["Disconnected clips", "Complete sequences"],
  ["Basic generations", "Professional editing"],
  ["Flat audio", "Cinematic sound design"],
  ["AI experimentation", "Repeatable production workflow"],
]

export default function AcademyHome() {
  const { user } = useAuth()
  const [showcase, setShowcase] = useState<ShowcaseVideo[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [products, setProducts] = useState<Array<{id:string;name:string;description:string;product_type:string;price:number;is_free:boolean;image_url:string|null}>>([])
  const [hasStudioAccess, setHasStudioAccess] = useState(false)
  const [studentWork, setStudentWork] = useState<Array<{id:string;title:string;video_url:string;category:string;display_name:string|null;allow_display_name:boolean}>>([])
  const [content, setContent] = useState(defaultContent)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    void Promise.all([
      supabase.from("showcase_items").select("*").order("is_featured", { ascending: false }).order("position").limit(9),
      supabase.from("courses").select("*").eq("is_published", true).eq("is_paused", false).eq("is_featured", true).order("sort_order", { ascending: true }).limit(6),
      supabase.from("digital_products").select("id,name,description,product_type,price,is_free,image_url").eq("active", true).eq("featured", true).limit(4),
      supabase.from("student_showcase_submissions").select("id,title,video_url,category,display_name,allow_display_name").in("status", ["approved","featured"]).order("created_at", { ascending: false }).limit(6),
      supabase.from("site_settings").select("value").eq("key","academy_content").maybeSingle(),
    ]).then(([work, courseRows, productRows, studentRows, contentRow]) => {
      if (!active) return
      if (work.data) setShowcase(sortShowcase(work.data.map(toShowcaseVideo)).filter((item) => item.videoUrl).slice(0, 9))
      if (courseRows.data) setCourses(courseRows.data as Course[])
      if (productRows.data) setProducts(productRows.data as typeof products)
      if (studentRows.data) setStudentWork(studentRows.data)
      if (contentRow.data?.value) setContent({...defaultContent,...contentRow.data.value})
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) { setHasStudioAccess(false); return }
    let active = true
    fetch("/api/entitlements/creator-studio", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : { entitled: false })
      .then((data) => { if (active) setHasStudioAccess(Boolean(data.entitled)) })
      .catch(() => { if (active) setHasStudioAccess(false) })
    return () => { active = false }
  }, [user])

  return (
    <main className="min-h-screen bg-[#070807] text-white">
      <Navbar academy />
      <section className="relative isolate flex min-h-[84vh] items-center overflow-hidden px-5 pb-16 pt-32 sm:px-8">
        {showcase[0]?.thumbnail && <img src={showcase[0].thumbnail} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-35" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/85 to-black/30" />
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><Film className="h-4 w-4" /> CREATIVE AI EDUCATION THAT GETS YOU PAID</span>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">{content.headline}</h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">{content.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/my-courses" className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 font-semibold text-black hover:brightness-110">See How It Works <ArrowRight className="h-4 w-4" /></Link>
              <a href="#work" className="inline-flex h-12 items-center gap-2 rounded-md border border-white/20 px-6 font-medium text-white hover:bg-white/10">See the Work</a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/50"><span className="inline-flex items-center gap-1.5"><span className="text-primary">✓</span> On-demand lessons</span><span className="inline-flex items-center gap-1.5"><span className="text-primary">✓</span> Live feedback on your work</span><span className="inline-flex items-center gap-1.5"><span className="text-primary">✓</span> Build a client-ready portfolio</span></div>
          </div>
          {showcase[0] && <div className="relative mx-auto aspect-video w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl shadow-black/60">
            {youtubeEmbedUrl(showcase[0].videoUrl) ? <iframe src={youtubeEmbedUrl(showcase[0].videoUrl, { autoplay: true, muted: true, loop: true })!} title={showcase[0].title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" /> : <video key={showcase[0].id} src={showcase[0].videoUrl} poster={showcase[0].thumbnail || undefined} autoPlay muted loop playsInline controls preload="metadata" aria-label={showcase[0].title} className="h-full w-full object-contain" />}
            <div className="pointer-events-none absolute left-0 right-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-5 pb-10 pt-4"><p className="text-xs uppercase tracking-[.2em] text-primary">Featured work</p><p className="mt-1 text-lg font-semibold">{showcase[0].title}</p></div>
          </div>}
          {content.show_coaching && <div className="lg:col-span-2"><CoachingOfferCard /></div>}
        </div>
      </section>

      <section className="border-y border-primary/15 bg-primary/[.04] px-5 py-8 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div><p className="text-sm font-semibold text-primary">The opportunity is already here.</p><p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/65 sm:text-base">Members are landing <span className="font-semibold text-white">$10K–$75K deals</span> making AI creative. The difference isn&apos;t access to another tool — it&apos;s knowing how to turn an idea into work a client can confidently buy.</p></div>
          <a href="#courses" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-primary/40 px-5 text-sm font-semibold text-primary hover:bg-primary/10">See the path <ArrowRight className="h-4 w-4" /></a>
        </div>
      </section>

      {content.show_showreel && <section id="work" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 sm:px-8">
        <SectionTitle eyebrow="THE WORK" title="Learn the Techniques Behind Work Like This" body="Study the choices behind the image, the movement, the edit and the sound." />
        {showcase.length ? <div className="mt-9"><ShowcaseReel videos={showcase} /></div> : <p className="mt-8 rounded-xl border border-white/10 p-6 text-sm text-white/45">Featured work is being curated.</p>}
      </section>}

      {content.show_transformation && <section className="border-y border-white/5 bg-white/[.02] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl"><SectionTitle eyebrow="THE CRAFT" title="Stop Generating Clips. Start Directing AI Videos." body="Tools and models will change. Creative judgment and a repeatable production process keep paying off." />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{transformations.map(([before, after]) => <div key={before} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-4"><span className="text-sm text-white/40">{before}</span><ArrowRight className="h-4 w-4 shrink-0 text-primary"/><span className="text-right text-sm font-semibold">{after}</span></div>)}</div>
        </div>
      </section>}

      {content.show_courses && <section id="courses" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 sm:px-8">
        <SectionTitle eyebrow="COURSES" title="Master AI Video Creation" body="Practical training in AI filmmaking, cinematography, character consistency, prompting, editing and production workflows." />
        {courses.length ? <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map((course) => <Link key={course.id} href={`/courses/${course.id}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] transition hover:-translate-y-1 hover:border-primary/40"><div className="aspect-video bg-black">{course.thumbnail && <img src={course.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]"/>}</div><div className="p-5"><div className="flex items-center justify-between text-xs text-white/45"><span>{course.level}</span><span>{course.chapters} modules · {course.duration}</span></div><h3 className="mt-3 text-lg font-semibold">{course.title}</h3><p className="mt-2 line-clamp-2 text-sm text-white/50">{course.description}</p><div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4"><span className="font-semibold text-primary">{isFreeCourse(course.price) ? "Free" : formatUsd(Number(course.price))}</span><span className="inline-flex items-center gap-1 text-sm">Explore <ArrowRight className="h-4 w-4 text-primary"/></span></div></div></Link>)}</div> : <p className="mt-8 text-sm text-white/45">Featured courses are being prepared. Browse the full course library in the meantime.</p>}
        <Link href="/my-courses" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary">View All Courses <ArrowRight className="h-4 w-4"/></Link>
      </section>}

      {content.show_workflow && <section className="border-y border-white/5 bg-white/[.02] px-5 py-20 sm:px-8"><div className="mx-auto max-w-7xl"><SectionTitle eyebrow="YOUR WORKFLOW" title="Learn. Create. Improve."/><div className="mt-9 grid gap-4 md:grid-cols-3">{[[BookOpen,"01","LEARN","Master professional AI video workflows through practical courses."],[Clapperboard,"02","CREATE","Use Creator Studio and included tools to build your own projects."],[Sparkles,"03","IMPROVE","Practice, build your portfolio and develop professional-level skills."]].map(([Icon, n, title, body]: any)=><div key={n} className="rounded-2xl border border-white/10 bg-black/30 p-6"><Icon className="h-6 w-6 text-primary"/><p className="mt-5 text-xs tracking-[.2em] text-primary">{n}</p><h3 className="mt-2 text-xl font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p></div>)}</div></div></section>}

      {content.show_products && products.length > 0 && <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8"><SectionTitle eyebrow="MORE WAYS TO LEARN" title="Build Your AI Video Toolkit" body="Add focused tools as your practice grows."/>
        {content.show_products && products.length > 0 && <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.map((product)=><Link href={`/products/${product.id}`} key={product.id} className="rounded-2xl border border-white/[.1] bg-white/[.03] p-5 transition hover:border-primary/40">{product.image_url ? <img src={product.image_url} alt="" className="mb-4 h-28 w-full rounded-lg object-cover"/>:<Sparkles className="mb-4 h-6 w-6 text-primary"/>}<p className="text-[10px] uppercase tracking-[.18em] text-primary">{product.product_type}</p><h3 className="mt-2 font-semibold">{product.name}</h3><p className="mt-2 text-sm text-white/50">{product.description}</p><div className="mt-4 flex items-center justify-between"><p className="text-sm font-semibold">{product.is_free ? "Free" : formatUsd(product.price)}</p><span className="text-xs text-primary">Explore →</span></div></Link>)}</div>}
      </section>}

      {content.show_student_work && studentWork.length > 0 && <section id="student-work" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 sm:px-8"><SectionTitle eyebrow="STUDENT WORK" title="Created by AI Director Hub Students" body="Shared by students who chose to submit their projects for public display."/><div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{studentWork.map((project)=><article key={project.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[.03]"><video src={project.video_url} controls playsInline preload="none" className="aspect-video w-full bg-black"/><div className="p-4"><p className="font-semibold">{project.title}</p>{project.allow_display_name && project.display_name && <p className="mt-1 text-xs text-white/45">By {project.display_name}</p>}<p className="mt-2 text-[10px] uppercase tracking-widest text-primary">{project.category.replaceAll("_", " ")}</p></div></article>)}</div></section>}

      {content.show_instructor && (content.instructor_name || content.instructor_bio) && <section className="border-y border-white/5 bg-white/[.02] px-5 py-20 sm:px-8"><div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-[220px_1fr] sm:items-center">{content.instructor_photo&&<img src={content.instructor_photo} alt={content.instructor_name} className="aspect-square w-full rounded-2xl object-cover"/>}<div><p className="text-xs font-semibold tracking-[.2em] text-primary">YOUR INSTRUCTOR</p><h2 className="mt-3 text-3xl font-semibold">{content.instructor_name}</h2><p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-white/60">{content.instructor_bio}</p>{content.instructor_experience&&<p className="mt-4 whitespace-pre-line text-sm text-white/45">{content.instructor_experience}</p>}</div></div></section>}

      {content.show_creator_studio && <section className="border-y border-white/5 bg-gradient-to-br from-primary/[.08] to-transparent px-5 py-20 sm:px-8"><div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs uppercase tracking-[.2em] text-primary">LEARN IT. THEN BUILD IT.</p><h2 className="mt-3 text-3xl font-semibold">Put your new skills to work in Creator Studio.</h2><p className="mt-3 max-w-2xl text-white/55">Creator Studio is invite only. Request an invitation from our team to apply what you learn and build real AI video projects.</p></div><Link href={"/studio"} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 font-semibold text-black">{user && hasStudioAccess ? "Open Creator Studio" : <><LockKeyhole className="h-4 w-4"/> Creator Studio · Invite Only</>}<ArrowRight className="h-4 w-4"/></Link></div></section>}

      <section className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-8"><Quote className="mx-auto h-8 w-8 text-primary"/><h2 className="mt-4 text-3xl font-semibold">Your next client won&apos;t pay for prompts.</h2><p className="mx-auto mt-3 max-w-xl text-white/55">They&apos;ll pay for creative judgment, reliable execution and work that helps them stand out. Start building that skill now.</p><Link href="/my-courses" className="mt-7 inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 font-semibold text-black">Start Your Path <ArrowRight className="h-4 w-4"/></Link></section>
      <section className="border-t border-white/10 bg-white/[.02] px-5 py-16 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-2xl border border-primary/20 bg-primary/[.04] p-6 sm:p-10 md:flex-row md:items-center">
          <div><p className="text-xs font-semibold tracking-[.2em] text-primary">DONE FOR YOU</p><h2 className="mt-3 text-3xl font-semibold">Have a project in mind? Hire our creative team.</h2><p className="mt-3 max-w-2xl text-white/55">From scripts and creative direction to AI production, editing and delivery — let our team bring your next video to life.</p></div>
          <Link href="/hire-us" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-primary px-6 font-semibold text-black">Hire Our Team <ArrowRight className="h-4 w-4"/></Link>
        </div>
      </section>
      <section className="border-t border-white/10 px-5 py-16 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-2xl border border-white/10 bg-black/30 p-6 sm:p-10 md:flex-row md:items-center">
          <div><p className="text-xs font-semibold tracking-[.2em] text-primary">AI DIRECTOR HUB ORIGINALS</p><h2 className="mt-3 text-3xl font-semibold">Watch original AI films and short series.</h2><p className="mt-3 max-w-2xl text-white/55">See what the same creative system can produce through original stories, episodes and cinematic experiments.</p></div>
          <Link href="/originals" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md border border-primary/50 px-6 font-semibold text-primary hover:bg-primary/10">Explore Originals <ArrowRight className="h-4 w-4"/></Link>
        </div>
      </section>
      <Footer />
    </main>
  )
}

function SectionTitle({eyebrow,title,body}:{eyebrow:string;title:string;body?:string}) { return <header><p className="text-xs font-semibold tracking-[.22em] text-primary">{eyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>{body && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">{body}</p>}</header> }
