"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, LogOut, Menu, User, X } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { isAdminUser } from "@/lib/membership"
import { fbTrack } from "@/lib/fbpixel"
import { FREE_COURSE_PATH, PRO_PATH } from "@/lib/course-catalog"
import { cn } from "@/lib/utils"

/**
 * The navigation for the course-and-studio site.
 *
 * It sells one thing, so it carries one button. A visitor gets where the
 * courses are, what the studio is, what it costs and a way in; a member gets
 * their three working pages and everything else about their account behind one
 * menu. Originals and Hire Our Team are in the footer — still reachable, no
 * longer competing with the Pro button for the only seat a phone has.
 *
 * `signedInHint` is the server's guess from the session cookie, used until the
 * browser has confirmed it, so the first paint is already the right bar.
 */

const visitorLinks = [
  { name: "Courses", href: "/courses" },
  { name: "Creator Studio", href: "/studio" },
  { name: "Pricing", href: "/#pricing" },
]

const memberLinks = [
  { name: "My Courses", href: "/my-courses" },
  { name: "Creator Studio", href: "/studio" },
  { name: "My Projects", href: "/hire-us/projects" },
]

const menuRow = "flex min-h-[44px] w-full items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"

export default function AcademyNavbar({ offerText = "", signedInHint = false }: { offerText?: string; signedInHint?: boolean }) {
  const { user, loading, signOut } = useAuth()
  const pathname = usePathname()
  // Whose admin row was found, rather than a bare flag: signing out or
  // switching account then needs no reset, the answer simply stops matching.
  const [adminId, setAdminId] = useState<string | null>(null)
  const isAdmin = Boolean(user) && adminId === user?.id
  // The menu is open "at" a path, so a navigation closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (next: boolean | ((current: boolean) => boolean)) =>
    setOpenAt((current) => ((typeof next === "function" ? next(current === pathname) : next) ? pathname : null))
  const menuRef = useRef<HTMLDivElement>(null)
  const signedIn = loading ? signedInHint : Boolean(user)

  useEffect(() => {
    if (!user) return
    let active = true
    isAdminUser(createClient(), user.id).then((admin) => { if (active) setAdminId(admin ? user.id : null) })
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenAt(null)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenAt(null) }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const links = signedIn ? memberLinks : visitorLinks
  const accountLinks = [
    { name: "My Account", href: "/account" },
    { name: "Billing", href: "/billing" },
    ...(isAdmin ? [{ name: "Admin", href: "/admin" }] : []),
  ]
  const trackPro = () => fbTrack("InitiateCheckout", { content_name: "AI Director Hub Pro", content_category: "subscription", value: 799, currency: "INR", placement: "nav" })

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 flex justify-center p-3 sm:p-4">
      {offerText && <div className="absolute left-0 right-0 top-0 bg-primary px-4 py-1 text-center text-xs font-medium text-black">{offerText}</div>}
      <div className={cn("material-chrome flex w-full max-w-6xl items-center gap-3 rounded-lg px-3 py-2.5 sm:px-5", offerText && "mt-6")}>
        <Link href="/" className="flex min-h-[44px] shrink-0 items-center gap-2.5">
          <img src="/logo.png" alt="AI Director Hub" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full" />
          <span className="hidden whitespace-nowrap text-lg font-semibold tracking-[-0.02em] text-white min-[400px]:inline lg:text-xl">AI Director <span className="text-primary">Hub</span></span>
        </Link>

        <div className="ml-auto hidden min-w-0 items-center gap-6 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="whitespace-nowrap text-sm font-medium text-white/70 transition-colors hover:text-white">{link.name}</Link>
          ))}
          {!signedIn && <Link href="/login" className="whitespace-nowrap text-sm font-medium text-white/70 transition-colors hover:text-white">Log in</Link>}
        </div>

        <div ref={menuRef} className="relative ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          {!signedIn && (
            <Link href={PRO_PATH} onClick={trackPro} className="flex h-10 items-center whitespace-nowrap rounded-md bg-primary px-4 text-sm font-semibold text-black transition hover:brightness-110 active:scale-[0.97]">Get Pro</Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={signedIn ? "Account menu" : "Menu"}
            className={cn(
              "h-10 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10",
              // A visitor's links are all in the bar from md up, so the button
              // is only their hamburger; a member's is the account menu at
              // every width.
              signedIn ? "flex" : "flex md:hidden",
            )}
          >
            {signedIn ? (
              <>
                {user?.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                  : <User className="h-4 w-4" />}
                <span className="hidden lg:inline">Account</span>
                <ChevronDown className={cn("hidden h-4 w-4 transition-transform md:block", open && "rotate-180")} />
                <Menu className="h-4 w-4 md:hidden" />
              </>
            ) : open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {open && (
            <div role="menu" className="material-sheet absolute right-0 top-full z-50 mt-2 w-64 rounded-lg bg-[#0d0f0e] p-2">
              <div className="md:hidden">
                {links.map((link) => <Link key={link.href} href={link.href} role="menuitem" onClick={() => setOpen(false)} className={menuRow}>{link.name}</Link>)}
                {!signedIn && (
                  <Link href={FREE_COURSE_PATH} role="menuitem" onClick={() => { fbTrack("Lead", { content_name: "Free course", placement: "nav" }); setOpen(false) }} className={menuRow}>Free course</Link>
                )}
                {signedIn && <div className="my-1 border-t border-white/10" />}
              </div>
              {signedIn ? (
                <>
                  {accountLinks.map((link) => <Link key={link.href} href={link.href} role="menuitem" className={menuRow}>{link.name}</Link>)}
                  <div className="my-1 border-t border-white/10" />
                  <button type="button" role="menuitem" onClick={signOut} className={menuRow}><LogOut className="h-4 w-4 text-white/50" /> Sign Out</button>
                </>
              ) : (
                <Link href="/login" role="menuitem" className={cn(menuRow, "md:hidden")}>Log in</Link>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
