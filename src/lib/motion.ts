/**
 * The two springs the interface is allowed to use.
 *
 * A fixed-duration curve cannot respond to new input: once it starts, it plays
 * to the end. A spring can — new input just moves the target and the motion
 * stays continuous — which is why anything a user can touch gets one of these.
 *
 * Framer Motion's `bounce` + `duration` map onto the two parameters Apple hands
 * its designers: damping ratio (how much it overshoots) and response (how
 * quickly it arrives). `duration` here is not a runtime; a spring has no fixed
 * one, and its settle time falls out of the parameters.
 */

/** The default. Critically damped: it arrives and stops, with no overshoot. */
export const springUI = { type: "spring", bounce: 0, duration: 0.35 } as const

/**
 * For motion that followed a flick, a throw, or a drag release — the bounce is
 * the momentum the gesture already carried, continuing. Never use it for
 * something that merely appeared: overshoot on a menu that faded in reads as a
 * glitch, while overshoot on a card you threw reads as physics.
 */
export const springMomentum = { type: "spring", bounce: 0.2, duration: 0.4 } as const

/** A sheet or drawer, which is dragged often enough to want a little give. */
export const springSheet = { type: "spring", bounce: 0.15, duration: 0.3 } as const

/**
 * Non-gesture transitions, matching the CSS custom properties in globals.css so
 * a Framer-animated element and a CSS-animated one next to it stay in step.
 */
export const durations = { press: 0.12, state: 0.24, surface: 0.4 } as const

/** Decelerating curve — the tuple form Framer Motion expects. */
export const easeOut = [0.22, 1, 0.36, 1] as const

/**
 * Fades in place instead of travelling. Reduced-motion users still get the
 * state change, just without the vestibular part.
 */
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: durations.state, ease: easeOut },
} as const

/**
 * A material arriving: blur and scale move together so the surface reads as
 * glass condensing into place rather than a rectangle whose opacity went up.
 */
export const materialize = {
  initial: { opacity: 0, scale: 0.97, filter: "blur(8px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.97, filter: "blur(8px)" },
  transition: springUI,
} as const
