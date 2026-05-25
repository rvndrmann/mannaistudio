export type CourseResource = {
    name: string
    url: string
}

export type CourseLesson = {
    id: number
    title: string
    duration: string
    videoUrl: string
    resources: CourseResource[]
}

export type Course = {
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
    lessons: CourseLesson[]
}

export type ShowcaseItem = {
    id: string
    title: string
    description: string
    thumbnail: string
    videoUrl: string
}

export type ChallengeSubmission = {
    id: string
    studentName: string
    videoUrl: string
    timestamp: string
    thumbnail: string
}

export type Challenge = {
    id: string
    title: string
    description: string
    prize: string
    deadline: string
    participants: number
    difficulty: string
    winnerId: string | null
    submissions: ChallengeSubmission[]
}

export type StudentVideo = {
    title: string
    views: string
    likes: number
    url: string
}

export type StudentStats = {
    level: number
    xp: number
    nextLevelXp: number
    badges: string[]
    videos: StudentVideo[]
}

export const courses: Course[] = [
    {
        id: "ai-video-101",
        title: "AI Video Fundamentals",
        description: "Master the basics of AI video generation using Runway, Pika, and Luma.",
        thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800",
        xp: 1200,
        duration: "4.5 Hours",
        level: "Beginner",
        chapters: 8,
        instructor: "Alex Rivera",
        price: "Free",
        lessons: [
            { id: 1, title: "Course Introduction", duration: "10:00", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", resources: [{ name: "Course Outline.pdf", url: "#" }] },
            { id: 2, title: "Setting up your environment", duration: "15:00", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", resources: [{ name: "Tool_Checklist.pdf", url: "#" }, { name: "Setup_Guide.zip", url: "#" }] },
            { id: 3, title: "Your First AI Generation", duration: "25:00", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", resources: [] },
        ]
    },
    {
        id: "advanced-cinematography",
        title: "AI Cinematography Masterclass",
        description: "Learn professional lighting, framing, and movement techniques with AI tools.",
        thumbnail: "https://images.unsplash.com/photo-1633167606207-d840b5070fc2?auto=format&fit=crop&q=80&w=800",
        xp: 2500,
        duration: "6.2 Hours",
        level: "Intermediate",
        chapters: 12,
        instructor: "Sarah Chen",
        price: "$49",
        lessons: [
            { id: 1, title: "Mastering the Lens", duration: "20:00", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", resources: [{ name: "Lens_Presets.json", url: "#" }] },
            { id: 2, title: "Lighting for AI", duration: "30:00", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", resources: [{ name: "Lighting_Cheat_Sheet.pdf", url: "#" }] },
        ]
    },
    {
        id: "ai-documentary",
        title: "AI Storytelling & Documentaries",
        description: "Create compelling narratives and documentaries using Gen-3 and Sora.",
        thumbnail: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800",
        xp: 3000,
        duration: "8 Hours",
        level: "Advanced",
        chapters: 15,
        instructor: "Marcus Thorne",
        price: "$99",
        lessons: []
    },
    {
        id: "music-video-ai",
        title: "AI Music Video Production",
        description: "Sync AI visuals perfectly with music for high-end music video production.",
        thumbnail: "https://images.unsplash.com/photo-1514525253361-bee8d48dce2b?auto=format&fit=crop&q=80&w=800",
        xp: 1800,
        duration: "5 Hours",
        level: "Intermediate",
        chapters: 10,
        instructor: "Elena Vance",
        price: "$29",
        lessons: []
    }
]

export const adminShowcase: ShowcaseItem[] = [
    {
        id: "showcase-1",
        title: "Liquid Dreams",
        description: "A surreal exploration of fluid dynamics created with Luma Dream Machine.",
        thumbnail: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&q=80&w=800",
        videoUrl: "#"
    },
    {
        id: "showcase-2",
        title: "The Neon Samurai",
        description: "Cinematic short story generated using Runway Gen-3 and Midjourney.",
        thumbnail: "https://images.unsplash.com/photo-1542332213-9b5a5a3fad35?auto=format&fit=crop&q=80&w=800",
        videoUrl: "#"
    }
]

export const challenges: Challenge[] = [
    {
        id: "weekly-1",
        title: "The Neon Dream",
        description: "Create a 15-second cyberpunk-style video using only AI tools.",
        prize: "$500",
        deadline: "2024-03-05",
        participants: 124,
        difficulty: "Medium",
        winnerId: "sub-1",
        submissions: [
            { id: "sub-1", studentName: "Sarah J.", videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4", timestamp: "2h ago", thumbnail: "https://images.unsplash.com/photo-1542332213-9b5a5a3fad35?auto=format&fit=crop&q=80&w=400" },
            { id: "sub-2", studentName: "Mike R.", videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4", timestamp: "5h ago", thumbnail: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?auto=format&fit=crop&q=80&w=400" },
            { id: "sub-3", studentName: "Elena V.", videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4", timestamp: "1d ago", thumbnail: "https://images.unsplash.com/photo-1514525253361-bee8d48dce2b?auto=format&fit=crop&q=80&w=400" }
        ]
    },
    {
        id: "weekly-2",
        title: "Nature's Pulse",
        description: "Generate a hyper-realistic macro shot of a plant growing in seconds.",
        prize: "$300",
        deadline: "2024-03-07",
        participants: 89,
        difficulty: "Hard",
        winnerId: "sub-4",
        submissions: [
            { id: "sub-4", studentName: "Alex Rivera", videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4", timestamp: "3h ago", thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=400" }
        ]
    }
]

export const studentStats: StudentStats = {
    level: 12,
    xp: 4500,
    nextLevelXp: 5000,
    badges: ["First Bloom", "Fast Learner", "Elite Creator"],
    videos: [
        { title: "Ocean's Whisper", views: "1.2k", likes: 245, url: "#" },
        { title: "Desert Mirage", views: "850", likes: 120, url: "#" }
    ]
}
