import type { SupabaseClient } from '@supabase/supabase-js'

function isSupabaseConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    return !!url && !!key && url !== 'your_supabase_url' && key !== 'your_supabase_anon_key' && url.startsWith('http')
}

async function getClient(): Promise<SupabaseClient | null> {
    if (!isSupabaseConfigured()) return null
    try {
        const { createClient } = await import('@/lib/supabase/client')
        return createClient()
    } catch {
        return null
    }
}

// Fetch all courses from Supabase, with fallback to mock data
export async function fetchCourses() {
    const supabase = await getClient()
    if (!supabase) {
        const { courses } = await import('./data')
        return courses
    }

    const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })

    if (error || !data || data.length === 0) {
        const { courses } = await import('./data')
        return courses
    }

    return data
}

// Fetch a single course with its lessons
export async function fetchCourseWithLessons(courseId: string) {
    const supabase = await getClient()
    if (!supabase) {
        const { courses } = await import('./data')
        return courses.find(c => c.id === courseId) || courses[0]
    }

    const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single()

    if (courseError || !course) {
        const { courses } = await import('./data')
        return courses.find(c => c.id === courseId) || courses[0]
    }

    const { data: lessons } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('order', { ascending: true })

    return {
        ...course,
        lessons: lessons || [],
    }
}

// Check if a user is enrolled in a course
export async function checkEnrollment(courseId: string) {
    const supabase = await getClient()
    if (!supabase) return false

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { data } = await supabase
        .from('enrollments')
        .select('status')
        .eq('profile_id', user.id)
        .eq('course_id', courseId)
        .single()

    return data?.status === 'active'
}

// Enroll user in a free course
export async function enrollFreeCourse(courseId: string) {
    const supabase = await getClient()
    if (!supabase) return false

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase.from('enrollments').upsert({
        profile_id: user.id,
        course_id: courseId,
        status: 'active',
        payment_id: 'free',
    }, { onConflict: 'profile_id,course_id' })

    return !error
}

// Get Supabase Storage public URL for a video
export function getVideoUrl(path: string) {
    if (!isSupabaseConfigured()) return path

    // We'll use dynamic import only if needed
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    return `${url}/storage/v1/object/public/videos/${path}`
}
