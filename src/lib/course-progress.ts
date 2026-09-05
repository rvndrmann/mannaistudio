// Course progress lives in the browser for now: there is no lesson_progress
// table yet, and losing a completed chapter on every refresh was worse than
// storing it here.
export function progressKey(courseId: string, userId?: string) {
    return `adh:course-progress:${userId || 'anon'}:${courseId}`
}

export function readProgress(courseId: string, userId?: string): number[] {
    try {
        const saved = localStorage.getItem(progressKey(courseId, userId))
        const parsed = saved ? JSON.parse(saved) : []
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export function writeProgress(courseId: string, chapters: number[], userId?: string) {
    try {
        localStorage.setItem(progressKey(courseId, userId), JSON.stringify(chapters))
    } catch {
        // A blocked storage jar only costs this person their saved progress.
    }
}
