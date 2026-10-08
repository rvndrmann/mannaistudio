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
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error || !data || data.length === 0) {
        const { courses } = await import('./data')
        return courses.filter(c => !c.is_paused && c.is_published !== false)
    }

    return data.filter((c: any) => !c.is_paused)
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

    const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/lessons`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load course lessons')
    const { lessons } = await response.json()

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

    const { data, error } = await supabase.rpc("can_access_course", { p_course_id: courseId })
    return !error && data === true
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

// Authorized temporary URL for a private course video.
export async function getVideoUrl(path: string) {
    if (!isSupabaseConfigured()) return path
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/`
    const storagePath = path.startsWith(prefix) ? decodeURIComponent(path.slice(prefix.length).split('?')[0]) : path
    if (/^https?:\/\//i.test(storagePath)) return storagePath
    const supabase = await getClient()
    if (!supabase) throw new Error('Supabase is not configured')
    const { data, error } = await supabase.storage.from('videos').createSignedUrl(storagePath, 15 * 60)
    if (error) throw error
    return data.signedUrl
}
