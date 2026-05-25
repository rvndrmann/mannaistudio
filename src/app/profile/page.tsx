"use client"

import Navbar from "@/components/Navbar"
import { motion, AnimatePresence } from "framer-motion"
import { User, Award, Play, Plus, Trash2, Globe, Lock, Settings, BarChart3, Mail, ExternalLink, Camera, CheckCircle2, LogIn, Loader2, Share2, X } from "lucide-react"
import { studentStats } from "@/lib/data"
import { FormEvent, useState, useEffect } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import {
    addPortfolioItem,
    createPortfolioSlug,
    deletePortfolioItem,
    ensurePortfolioProfile,
    fetchMyPortfolioItems,
    getPortfolioClient,
    isSupabaseConfigured,
    portfolioStorageKey,
    type PortfolioVideo,
    updatePortfolioVisibility,
    uploadPortfolioFile,
} from "@/lib/portfolio"

export default function ProfilePage() {
    const { user, loading, signInWithGoogle } = useAuth()
    const [videos, setVideos] = useState<PortfolioVideo[]>([])
    const [isPublic, setIsPublic] = useState(true)
    const [profile, setProfile] = useState<any>(null)
    const [isAddingVideo, setIsAddingVideo] = useState(false)
    const [shareMessage, setShareMessage] = useState("")
    const [portfolioMessage, setPortfolioMessage] = useState("")
    const [isSavingVideo, setIsSavingVideo] = useState(false)
    const [uploadProgress, setUploadProgress] = useState("")
    const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false)
    const [backendReady, setBackendReady] = useState(isSupabaseConfigured())
    const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)
    const [newVideo, setNewVideo] = useState({
        title: "",
        url: "",
        thumbnail: "",
        videoFile: null as File | null,
        thumbnailFile: null as File | null,
    })

    useEffect(() => {
        if (user) {
            loadProfile()
        }
    }, [user])

    const loadProfile = async () => {
        if (!user) return

        const supabase = await getPortfolioClient()
        if (!supabase) {
            // Supabase not configured, use fallback data
            setProfile({
                full_name: user.user_metadata?.full_name || 'Student',
                avatar_url: user.user_metadata?.avatar_url || '',
                email: user.email,
                xp: studentStats.xp,
                level: studentStats.level,
                portfolio_slug: createPortfolioSlug(user.user_metadata?.full_name || 'Student', user.id),
                is_portfolio_public: true,
            })
            setBackendReady(false)
            return
        }

        try {
            // Try to get existing profile
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (error && error.code === 'PGRST116') {
                // Profile doesn't exist, create one
                const newProfile = await ensurePortfolioProfile(supabase, user.id, {
                    full_name: user.user_metadata?.full_name || 'Student',
                    avatar_url: user.user_metadata?.avatar_url || '',
                    email: user.email,
                    xp: studentStats.xp,
                    level: studentStats.level,
                })
                setProfile(newProfile)
            } else {
                const nextProfile = await ensurePortfolioProfile(supabase, user.id, {
                    full_name: data?.full_name || user.user_metadata?.full_name || 'Student',
                    avatar_url: data?.avatar_url || user.user_metadata?.avatar_url || '',
                    email: data?.email || user.email,
                    xp: data?.xp || studentStats.xp,
                    level: data?.level || studentStats.level,
                })
                setProfile(nextProfile)
                setIsPublic(nextProfile?.is_portfolio_public ?? true)
            }
            setBackendReady(true)
            setIsLoadingPortfolio(true)
            const portfolioItems = await fetchMyPortfolioItems(supabase, user.id)
            setVideos(portfolioItems)
        } catch (e) {
            // Fallback to user metadata if Supabase fails
            setProfile({
                full_name: user.user_metadata?.full_name || 'Student',
                avatar_url: user.user_metadata?.avatar_url || '',
                email: user.email,
                xp: studentStats.xp,
                level: studentStats.level,
                portfolio_slug: createPortfolioSlug(user.user_metadata?.full_name || 'Student', user.id),
                is_portfolio_public: true,
            })
            setBackendReady(false)
            setPortfolioMessage("Supabase portfolio tables are not ready yet. Run supabase-portfolio.sql to enable backend storage.")
        } finally {
            setIsLoadingPortfolio(false)
        }
    }

    useEffect(() => {
        if (backendReady) return
        try {
            const savedVideos = window.localStorage.getItem(portfolioStorageKey)
            if (savedVideos) {
                setVideos(JSON.parse(savedVideos))
            }
        } catch (e) {
            setVideos([])
        }
    }, [backendReady])

    useEffect(() => {
        if (backendReady) return
        try {
            window.localStorage.setItem(portfolioStorageKey, JSON.stringify(videos))
        } catch (e) {
            // Portfolio still works for the session even if browser storage is blocked.
        }
    }, [backendReady, videos])

    const handleAddVideo = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!newVideo.title.trim() || (!newVideo.url.trim() && !newVideo.videoFile) || videos.length >= 10 || !user) return

        setIsSavingVideo(true)
        setPortfolioMessage("")
        setUploadProgress("")

        try {
            const supabase = await getPortfolioClient()
            const fallbackThumbnail = `https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800&sig=${Date.now()}`
            let videoUrl = newVideo.url.trim()
            let thumbnailUrl = newVideo.thumbnail.trim() || fallbackThumbnail

            if (supabase && backendReady) {
                if (newVideo.videoFile) {
                    setUploadProgress(`Uploading video (${(newVideo.videoFile.size / 1024 / 1024).toFixed(1)} MB)...`)
                    videoUrl = await uploadPortfolioFile(supabase, user.id, newVideo.videoFile)
                    setUploadProgress("Video uploaded ✓")
                }
                if (newVideo.thumbnailFile) {
                    setUploadProgress("Uploading thumbnail...")
                    thumbnailUrl = await uploadPortfolioFile(supabase, user.id, newVideo.thumbnailFile)
                    setUploadProgress("Thumbnail uploaded ✓")
                }
                setUploadProgress("Saving to portfolio...")

                const savedVideo = await addPortfolioItem(supabase, {
                    userId: user.id,
                    title: newVideo.title.trim(),
                    videoUrl,
                    thumbnailUrl,
                })

                setVideos((currentVideos) => [savedVideo, ...currentVideos].slice(0, 10))
                setPortfolioMessage("Saved to Supabase.")
            } else {
                const nextVideo: PortfolioVideo = {
                    id: `video-${Date.now()}`,
                    title: newVideo.title.trim(),
                    url: videoUrl,
                    thumbnail: thumbnailUrl,
                    views: "0",
                    likes: 0,
                }
                setVideos((currentVideos) => [nextVideo, ...currentVideos].slice(0, 10))
                setPortfolioMessage("Saved locally. Supabase setup is pending.")
            }

            setNewVideo({ title: "", url: "", thumbnail: "", videoFile: null, thumbnailFile: null })
            setIsAddingVideo(false)
            setUploadProgress("✓ Upload complete!")
            setTimeout(() => setUploadProgress(""), 3000)
        } catch (e) {
            setUploadProgress("")
            setPortfolioMessage("Could not save to Supabase. Check the portfolio SQL setup and storage bucket.")
        } finally {
            setIsSavingVideo(false)
        }
    }

    const handleRemoveVideo = async (id: string) => {
        if (!user) return
        setPortfolioMessage("")
        try {
            const supabase = await getPortfolioClient()
            if (supabase && backendReady) {
                await deletePortfolioItem(supabase, id, user.id)
                setPortfolioMessage("Removed from Supabase.")
            }
            setVideos((currentVideos) => currentVideos.filter((video) => video.id !== id))
        } catch (e) {
            setPortfolioMessage("Could not remove this item from Supabase.")
        }
    }

    const handleToggleVisibility = async () => {
        if (!user) return
        const nextValue = !isPublic
        setIsPublic(nextValue)
        setShareMessage("")

        try {
            const supabase = await getPortfolioClient()
            if (supabase && backendReady) {
                await updatePortfolioVisibility(supabase, user.id, nextValue)
            }
        } catch (e) {
            setIsPublic(!nextValue)
            setShareMessage("Could not update portfolio visibility.")
        }
    }

    const progress = ((profile?.xp || studentStats.xp) / studentStats.nextLevelXp) * 100

    // Show sign-in prompt if not logged in
    if (!loading && !user) {
        return (
            <main className="min-h-screen pb-20">
                <Navbar />
                <section className="pt-32 px-6 max-w-2xl mx-auto text-center">
                    <div className="glass-card p-12 space-y-6">
                        <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                            <LogIn className="w-10 h-10 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold">Sign In to View Your Profile</h1>
                        <p className="text-white/50">Access your profile, track your progress, and manage your portfolio.</p>
                        <button
                            onClick={signInWithGoogle}
                            className="btn-primary mx-auto flex items-center gap-3 px-8 py-3"
                        >
                            <LogIn className="w-5 h-5" />
                            Sign In with Google
                        </button>
                    </div>
                </section>
            </main>
        )
    }

    if (loading) {
        return (
            <main className="min-h-screen pb-20">
                <Navbar />
                <section className="pt-32 px-6 max-w-2xl mx-auto text-center">
                    <div className="glass-card p-12 flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        <p className="text-white/50">Loading your profile...</p>
                    </div>
                </section>
            </main>
        )
    }

    const displayName = profile?.full_name || user?.user_metadata?.full_name || 'Student'
    const displayEmail = profile?.email || user?.email || ''
    const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || ''
    const userLevel = profile?.level || studentStats.level
    const userXp = profile?.xp || studentStats.xp
    const portfolioSlug = profile?.portfolio_slug || (user ? createPortfolioSlug(displayName, user.id) : "creator")
    const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/portfolio?u=${portfolioSlug}`

    const handleSharePortfolio = async () => {
        if (!isPublic) {
            setShareMessage("Make your portfolio public before sharing.")
            return
        }

        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${displayName}'s AI Video Portfolio`,
                    text: `View ${displayName}'s AI video portfolio.`,
                    url: shareUrl,
                })
                setShareMessage("Portfolio shared.")
                return
            }

            await navigator.clipboard.writeText(shareUrl)
            setShareMessage("Share link copied.")
        } catch (e) {
            setShareMessage("Copy failed. Use the public portfolio button.")
        }
    }

    return (
        <main className="min-h-screen pb-20">
            <Navbar />

            {/* Profile Header */}
            <section className="pt-32 px-6 max-w-7xl mx-auto">
                <div className="glass-card p-8 md:p-12 mb-12 relative overflow-hidden">
                    {/* Background Decorative Pattern */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[120px] rounded-full -z-10" />

                    <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
                        <div className="relative group">
                            <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl bg-gradient-to-br from-primary to-cyan-400 p-1">
                                <div className="w-full h-full rounded-[20px] bg-[#0a0a0f] flex items-center justify-center overflow-hidden">
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt="Avatar"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <User className="w-16 h-16 text-white/30" />
                                    )}
                                </div>
                            </div>
                            <button className="absolute bottom-2 right-2 p-2 bg-primary rounded-xl shadow-lg hover:scale-110 transition-transform">
                                <Camera className="w-4 h-4 text-white" />
                            </button>
                        </div>

                        <div className="flex-grow text-center md:text-left space-y-4">
                            <div>
                                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-1">{displayName}</h1>
                                <p className="text-white/40 flex items-center justify-center md:justify-start gap-2">
                                    <Mail className="w-4 h-4" /> {displayEmail}
                                </p>
                            </div>

                            <div className="flex flex-wrap justify-center md:justify-start gap-4">
                                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 flex items-center gap-2">
                                    <Award className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm font-bold">Level {userLevel}</span>
                                </div>
                                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-primary" />
                                    <span className="text-sm font-bold">{userXp} XP Earned</span>
                                </div>
                            </div>

                            <div className="space-y-2 max-w-sm">
                                <div className="flex justify-between text-xs font-bold text-white/40">
                                    <span>PROGRESS TO LEVEL {userLevel + 1}</span>
                                    <span>{Math.round(progress)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        className="h-full bg-gradient-to-r from-primary to-cyan-400"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 min-w-[200px]">
                            <button className="btn-primary flex items-center justify-center gap-2 w-full">
                                <Settings className="w-4 h-4" /> Edit Profile
                            </button>
                            <button
                                onClick={handleToggleVisibility}
                                className="flex items-center justify-center gap-2 w-full px-6 py-2.5 glass rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
                            >
                                {isPublic ? <Globe className="w-4 h-4 text-emerald-500" /> : <Lock className="w-4 h-4 text-amber-500" />}
                                {isPublic ? "Public Portfolio" : "Private Portfolio"}
                            </button>
                            <button
                                onClick={handleSharePortfolio}
                                className="flex items-center justify-center gap-2 w-full px-6 py-2.5 bg-white/10 rounded-xl text-sm font-bold hover:bg-white/20 transition-colors"
                            >
                                <Share2 className="w-4 h-4 text-cyan-300" />
                                Share Portfolio
                            </button>
                            {shareMessage && (
                                <p className="text-xs text-white/40 text-center">{shareMessage}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar: Badges */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="glass-card p-6">
                            <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-xs text-white/40">
                                Earned Badges
                            </h3>
                            <div className="flex flex-wrap gap-3">
                                {studentStats.badges.map((badge) => (
                                    <div key={badge} className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-[10px] font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> {badge}
                                    </div>
                                ))}
                                <div className="px-3 py-1.5 bg-white/5 border border-dashed border-white/10 rounded-lg text-[10px] font-bold text-white/20 flex items-center gap-1.5 uppercase tracking-wider italic">
                                    ? Next Badge
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-6">
                            <h3 className="font-bold mb-4 uppercase tracking-widest text-xs text-white/40">
                                Completed Courses
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <p className="text-xs font-medium">AI Video Fundamentals</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <p className="text-xs font-medium">Neon Aesthetic Mastery</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Portfolio Section */}
                    <div className="lg:col-span-3 space-y-8">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold">Showcase Portfolio</h2>
                                <p className="text-sm text-white/40">
                                    {isLoadingPortfolio ? "Loading saved work..." : `${videos.length} of 10 slots filled`}
                                </p>
                                {portfolioMessage && (
                                    <p className="text-xs text-white/40 mt-2">{portfolioMessage}</p>
                                )}
                            </div>
                            <button
                                onClick={() => setIsAddingVideo(true)}
                                disabled={videos.length >= 10}
                                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 rounded-xl transition-all font-bold text-xs"
                            >
                                <Plus className="w-4 h-4" /> Add New Video
                            </button>
                        </div>

                        {isAddingVideo && (
                            <motion.form
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onSubmit={handleAddVideo}
                                className="glass-card p-6 space-y-4"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold">Add Portfolio Work</h3>
                                        <p className="text-sm text-white/40">Add a video link and optional thumbnail for your public showcase.</p>
                                        <p className="text-xs text-white/30 mt-1">
                                            {backendReady ? "Files and links are saved in Supabase." : "Local fallback is active until Supabase tables are installed."}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingVideo(false)}
                                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                        aria-label="Close add video form"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="space-y-2">
                                        <span className="text-xs font-bold uppercase tracking-widest text-white/40">Title</span>
                                        <input
                                            value={newVideo.title}
                                            onChange={(event) => setNewVideo({ ...newVideo, title: event.target.value })}
                                            placeholder="Cinematic city flythrough"
                                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-primary"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-bold uppercase tracking-widest text-white/40">Video URL</span>
                                        <input
                                            value={newVideo.url}
                                            onChange={(event) => setNewVideo({ ...newVideo, url: event.target.value })}
                                            placeholder="https://youtube.com/watch?v=... or upload below"
                                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-primary"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-xs font-bold uppercase tracking-widest text-white/40">Upload Video</span>
                                        <input
                                            type="file"
                                            accept="video/*"
                                            onChange={(event) => setNewVideo({ ...newVideo, videoFile: event.target.files?.[0] || null })}
                                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
                                        />
                                    </label>
                                    <label className="space-y-2 md:col-span-2">
                                        <span className="text-xs font-bold uppercase tracking-widest text-white/40">Thumbnail URL</span>
                                        <input
                                            value={newVideo.thumbnail}
                                            onChange={(event) => setNewVideo({ ...newVideo, thumbnail: event.target.value })}
                                            placeholder="Optional image URL"
                                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-primary"
                                        />
                                    </label>
                                    <label className="space-y-2 md:col-span-2">
                                        <span className="text-xs font-bold uppercase tracking-widest text-white/40">Upload Thumbnail</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(event) => setNewVideo({ ...newVideo, thumbnailFile: event.target.files?.[0] || null })}
                                            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
                                        />
                                    </label>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingVideo(false)}
                                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={isSavingVideo} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60">
                                        {isSavingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        {isSavingVideo ? "Saving..." : "Add to Portfolio"}
                                    </button>
                                </div>
                                {uploadProgress && isSavingVideo && (
                                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                                        <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                                        <span className="text-xs font-medium text-primary">{uploadProgress}</span>
                                    </motion.div>
                                )}
                                {uploadProgress && !isSavingVideo && uploadProgress.includes('✓') && (
                                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                        <span className="text-xs font-medium text-emerald-400">{uploadProgress}</span>
                                    </motion.div>
                                )}
                            </motion.form>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {videos.map((video, i) => (
                                <motion.div
                                    key={video.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="glass-card group overflow-hidden cursor-pointer"
                                    onClick={() => video.url && setPlayingVideo({ url: video.url, title: video.title })}
                                >
                                    <div className="relative aspect-video bg-black/50">
                                        {video.thumbnail ? (
                                            <img
                                                src={video.thumbnail}
                                                alt={video.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : video.url ? (
                                            <video
                                                src={`${video.url}#t=0.1`}
                                                muted
                                                preload="metadata"
                                                playsInline
                                                className="w-full h-full object-cover"
                                            />
                                        ) : null}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="p-4 rounded-full bg-primary/80 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity scale-75 group-hover:scale-100 transition-transform">
                                                <Play className="w-7 h-7 fill-white" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Play className="w-3 h-3 fill-white text-white/40" />
                                            <span className="text-sm font-bold">{video.title}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                                                <span>{video.views} Views</span>
                                                <span>{video.likes} Likes</span>
                                                <span className="text-emerald-500">Active</span>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemoveVideo(video.id) }}
                                                className="p-2 rounded-lg hover:bg-destructive/10 text-white/30 hover:text-destructive transition-colors"
                                                aria-label={`Remove ${video.title}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}

                            {videos.length < 10 && (
                                <button
                                    onClick={() => setIsAddingVideo(true)}
                                    className="aspect-video glass border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-4 hover:bg-white/5 hover:border-white/20 transition-all group"
                                >
                                    <div className="p-4 bg-white/5 rounded-full group-hover:scale-110 transition-transform">
                                        <Plus className="w-8 h-8 text-white/20 group-hover:text-primary" />
                                    </div>
                                    <p className="text-sm font-bold text-white/20 group-hover:text-white">Upload Your Work</p>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Video Player Modal */}
            <AnimatePresence>
                {playingVideo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-xl"
                        onClick={() => setPlayingVideo(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f0f15] rounded-3xl border border-white/10 overflow-hidden w-full max-w-5xl shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-xl font-bold">{playingVideo.title}</h3>
                                <button onClick={() => setPlayingVideo(null)} className="p-2 hover:bg-white/10 rounded-2xl text-white/40 hover:text-white transition-all">
                                    <X className="w-7 h-7" />
                                </button>
                            </div>
                            <div className="aspect-video bg-black">
                                <video
                                    key={playingVideo.url}
                                    src={playingVideo.url}
                                    controls
                                    autoPlay
                                    playsInline
                                    preload="auto"
                                    className="w-full h-full"
                                    onCanPlay={(e) => { (e.target as HTMLVideoElement).play().catch(() => {}) }}
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    )
}
