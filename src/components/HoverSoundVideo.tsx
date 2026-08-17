"use client"

import { useCallback, useEffect, useRef, useState, type VideoHTMLAttributes } from "react"
import { Volume2, VolumeX } from "lucide-react"

/**
 * A showcase clip that plays on its own and turns its sound on as soon as the
 * browser will allow it.
 *
 * It cannot simply start with sound, and no amount of markup changes that:
 * Chrome, Safari and Firefox all refuse audible autoplay until the visitor has
 * interacted with the page, and a clip that is refused does not fall back to
 * playing silently — it does not play at all, leaving a frozen frame where the
 * showreel should be. So the clip always starts muted, which is what makes it
 * allowed to play, and the sound is switched on at the first moment the browser
 * will accept it:
 *
 *   - `autoSound` waits for the visitor's first click, key press or tap
 *     anywhere on the page — the gesture browsers count as permission — and
 *     unmutes immediately, without their having to find the video.
 *   - Hovering the clip unmutes it too, and re-mutes on leaving.
 *   - The speaker badge is a real button, so the sound can always be turned off.
 *
 * Only one clip on a page should carry `autoSound`; several unmuting at once is
 * three soundtracks over each other.
 */
export default function HoverSoundVideo({
  className,
  onLoadedMetadata,
  autoSound = false,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement> & { autoSound?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [audible, setAudible] = useState(false)
  // Set once the visitor turns the sound off by hand. After that, neither a
  // hover nor a page click may turn it back on — an override they have to keep
  // reapplying is not an override.
  const silenced = useRef(false)

  const unmute = useCallback(() => {
    const video = ref.current
    if (!video || silenced.current) return
    video.muted = false
    video.volume = 1
    // play() resolves only if the browser accepted audible playback. If it
    // rejects, the element goes straight back to muted and keeps playing
    // silently rather than stalling on a still frame.
    video.play().then(() => setAudible(true)).catch(() => {
      video.muted = true
      setAudible(false)
      video.play().catch(() => {})
    })
  }, [])

  const mute = useCallback(() => {
    const video = ref.current
    if (!video) return
    video.muted = true
    setAudible(false)
  }, [])

  useEffect(() => {
    if (!autoSound) return
    const video = ref.current
    if (!video) return

    // Only try straight away if the browser has already granted this page a
    // gesture — a soft navigation, or a visitor coming back to a tab they used.
    // Asking speculatively is not free: the rejected play() interrupts the
    // silent playback that was working, and the clip can end up stopped on a
    // still frame, which is worse than being quiet.
    if (navigator.userActivation?.hasBeenActive) unmute()

    // Otherwise the first gesture anywhere on the page is the permission the
    // browser was waiting for. Once is enough, hence { once: true }.
    const events = ["pointerdown", "keydown", "touchstart"] as const
    const onGesture = () => unmute()
    events.forEach((event) => document.addEventListener(event, onGesture, { once: true, passive: true }))
    return () => events.forEach((event) => document.removeEventListener(event, onGesture))
  }, [autoSound, unmute])

  return (
    <>
      <video
        {...props}
        ref={ref}
        muted
        playsInline
        className={className}
        onMouseEnter={unmute}
        onMouseLeave={autoSound ? undefined : mute}
        onLoadedMetadata={onLoadedMetadata}
      />
      {/* A real button, not a label. A page that makes noise and gives you no
          way to stop it is the reason browsers block this in the first place. */}
      <button
        type="button"
        aria-label={audible ? "Mute video" : "Unmute video"}
        onClick={(event) => {
          event.stopPropagation()
          if (audible) {
            silenced.current = true
            mute()
          } else {
            silenced.current = false
            unmute()
          }
        }}
        className="absolute right-2.5 top-2.5 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/80"
      >
        {audible ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
    </>
  )
}
