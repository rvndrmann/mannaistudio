"use client"

import Navbar from "@/components/Navbar"
import { motion } from "framer-motion"
import { Play, Clock, Sparkles, Loader2 } from "lucide-react"
import Link from "next/link"
import { courses as mockCourses } from "@/lib/data"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

interface Course {
    id: string
    title: string
    description: string
    thumbnail: string
    xp: number
    duration: string
    level: string
    chapters: number
    instructor: string
    price: string
}

export default function CoursesPage() {
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from('courses')
                    .select('*')
                    .order('created_at', { ascending: true })
                if (error || !data) {
                    setCourses(mockCourses)
                } else {
                    setCourses(data)
                }
            } catch {
                setCourses(mockCourses)
            }
            setLoading(false)
        }
        load()
    }, [])

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            <section className="pt-32 px-6 max-w-7xl mx-auto">
                <header className="mb-12">
                    <motion.h1
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-4xl font-bold mb-4"
                    >
                        Explore <span className="text-primary">Courses</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-white/60"
                    >
                        Level up your skills with our expert-led AI video tutorials.
                    </motion.p>
                </header>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {courses.map((course, i) => (
                        <motion.div
                            key={course.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="glass-card flex flex-col h-full overflow-hidden group"
                        >
                            <div className="relative aspect-video overflow-hidden">
                                <img
                                    src={course.thumbnail}
                                    alt={course.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                />
                                <div className="absolute top-3 right-3 px-3 py-1 glass rounded-full text-[10px] font-bold tracking-widest uppercase">
                                    {course.level}
                                </div>
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-primary p-4 rounded-full shadow-2xl scale-75 group-hover:scale-100 transition-transform">
                                        <Play className="w-6 h-6 fill-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 flex flex-col flex-grow">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        +{course.xp} XP
                                    </span>
                                    <span className="text-white/20">|</span>
                                    <span className="text-xs text-white/50">{course.chapters} Chapters</span>
                                </div>

                                <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors line-clamp-1">{course.title}</h3>
                                <p className="text-white/50 text-sm mb-6 line-clamp-2 leading-relaxed">
                                    {course.description}
                                </p>

                                <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-white/40 text-xs">
                                        <Clock className="w-4 h-4" />
                                        <span>{course.duration}</span>
                                    </div>
                                    <Link
                                        href={`/courses/${course.id}`}
                                        className="text-sm font-medium text-white hover:text-primary transition-colors flex items-center gap-1.5"
                                    >
                                        Enroll Now <Play className="w-3.5 h-3.5" />
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
                )}
            </section>
        </main>
    )
}
