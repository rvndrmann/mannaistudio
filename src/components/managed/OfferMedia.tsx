import type { ReactNode } from "react"

/**
 * The band a gig's promo art is shown in.
 *
 * These are ads, and ads are shot vertical far more often than wide — so a card
 * that crops promo art into a 16:9 box shows the middle slice of a 9:16 frame:
 * two actors with their heads and feet cut off, which is the one thing a page
 * selling video production cannot afford to look like.
 *
 * So the frame is never cropped. It is fitted whole into a band of fixed
 * height, which is what keeps a grid of cards aligned when one gig is vertical
 * and the next is wide, and a blurred copy of the same picture fills the space
 * beside it — black bars read as a broken player, a soft wash reads as a
 * poster.
 */
export default function OfferMediaFrame({ fill, className, children }: {
  /** Image used as the blurred backdrop. Omitted, the band is plain black. */
  fill?: string
  /** Overrides the band's height. */
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`relative overflow-hidden bg-black ${className || "h-[340px] sm:h-[440px]"}`}>
      {fill && (
        <img
          src={fill}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl"
        />
      )}
      {/* Flex, not grid: a percentage height on a replaced element inside a
          centred grid cell resolves against an indefinite row, so `h-full` on
          the video was ignored and a 1080×1920 clip laid itself out at the
          band's full width and 601px tall — overflowing the very box meant to
          contain it. Against a flex line the max-height below resolves. */}
      <div className="relative flex h-full w-full items-center justify-center">{children}</div>
    </div>
  )
}

/**
 * How the picture or clip inside the band is sized: whole, and centred.
 *
 * Two maxima and no fixed dimension — the browser scales the frame down to fit
 * inside both, keeping its own ratio. A 9:16 ad meets the height, a 16:9 one
 * meets the width, and neither is ever cut.
 */
export const offerMediaFit = "max-h-full max-w-full object-contain"
