# Apple-Grade Design Plan

Applying the `apple-design` skill (Apple's WWDC design talks, translated to web) to
AI Director Hub. Ordered so each phase is shippable on its own and later phases build
on earlier ones.

## Audit baseline (measured 2026-08-17)

| Signal | Count | Why it fights the Apple aesthetic |
| --- | --- | --- |
| `font-black` | 160 | Max weight everywhere = no hierarchy. Weight must be earned. |
| `uppercase` | 271 | Uppercase + wide tracking micro-labels read as loud, not calm. |
| `hover:scale-105/110` | 26 | Grow-on-hover is a web trope; Apple shrinks on *press*. |
| `transition-all` | 70 | Animates non-compositor properties → dropped frames. |
| `prefers-reduced-motion` | 0 | No accessibility handling. |
| `rounded-[Npx]` | 16/20/22/24/26/28/32 | Seven ad-hoc radii, no scale. `--radius` is declared and unused. |
| `duration-*` | 75/200/300/500/700 | No motion system; values picked per-component. |

---

## Phase 1 — Design tokens (foundation, no visual risk)

**Files:** `src/app/globals.css`, `tailwind.config.ts`

Define the vocabulary once so every later phase has defensible values (Craft, §16.7).

### Radius scale
Replace seven ad-hoc pixel radii with four tokens. Apple's rule is that bigger
surfaces get bigger radii, consistently:

```css
--radius-sm: 8px;    /* chips, badges, inputs */
--radius-md: 14px;   /* buttons, small cards */
--radius-lg: 22px;   /* cards, panels */
--radius-xl: 30px;   /* hero containers, sheets */
```

### Motion scale
Springs, not durations, for anything a user touches (§4). Two named springs:

```ts
// src/lib/motion.ts
export const springUI     = { type: 'spring', bounce: 0,   duration: 0.35 } // default
export const springMoment = { type: 'spring', bounce: 0.2, duration: 0.4  } // post-flick only
```

Non-gesture CSS transitions get exactly three durations: `120ms` (press feedback),
`240ms` (hover/state), `400ms` (surface enter/exit).

### Type scale
Size-specific tracking and leading, per §15 — one `letter-spacing` for all sizes is
wrong somewhere:

| Role | Size | Leading | Tracking | Weight |
| --- | --- | --- | --- | --- |
| Display | `clamp(2.75rem, 6vw, 5rem)` | `1.05` | `-0.03em` | 600 |
| H1 | `clamp(2rem, 4vw, 3rem)` | `1.1` | `-0.02em` | 600 |
| H2 | `1.75rem` | `1.2` | `-0.015em` | 600 |
| Body-lg | `1.125rem` | `1.6` | `0` | 400 |
| Body | `1rem` | `1.6` | `0` | 400 |
| Caption | `0.8125rem` | `1.45` | `+0.01em` | 500 |

Note the maximum weight is **600**, not 900. Emphasis comes from size + leading +
contrast, not from bolding everything.

### Font
Keep Inter (it has optical sizing and is close to SF), but add
`font-optical-sizing: auto` and set `font-variation-settings` so weights resolve
cleanly. Do **not** swap to `system-ui` — brand consistency across platforms matters
more here than the platform-font default in §15.

---

## Phase 2 — Typography pass (the biggest visual win)

**Files:** `src/app/page.tsx` (660 lines), `src/app/courses/page.tsx`,
`src/app/services/page.tsx` (898), `src/app/profile/page.tsx` (708),
`src/components/Navbar.tsx`, `Footer.tsx`, `MarketingHeader.tsx`

This is what makes a site read as Apple more than any animation.

1. **Kill the uppercase eyebrows.** Convert the 271 `uppercase tracking-[.2em]`
   labels to sentence case at caption size with `+0.01em` tracking and
   `text-white/50`. Where a label is purely decorative (most "MODELS" / "AGENT"
   pills), delete it — Simplicity (§16.6): every element earns its place.
2. **`font-black` → `font-semibold`** across all 160 occurrences, then selectively
   promote only true page-level headlines. The hero H1 keeps presence through
   `-0.03em` tracking and `1.05` leading, not weight.
3. **Negative tracking on all large text**, zero on body. Currently
   `tracking-tight` is applied unevenly and body copy inherits nothing.
4. **Spacing in `rem`, not `px`**, so a user's larger text setting scales the layout
   with it (§15, Dynamic Type).

---

## Phase 3 — Materials, depth, and chrome

**Files:** `src/components/Navbar.tsx`, `MarketingHeader.tsx`, all modal/sheet
components, `src/app/globals.css` (`.glass`, `.glass-card`)

Per §12 — translucency is a functional layer that conveys hierarchy, not decoration.

1. **Navbar becomes a real translucent layer.** Currently the landing page reserves
   `h-28` of dead space under it (`page.tsx:201`). Instead: content scrolls
   *underneath* a `backdrop-filter: blur(20px) saturate(180%)` bar with a bright
   top-edge hairline. Reclaims 112px of hero and reads as material.
2. **Scroll edge effect, not a hard divider.** Fade a small gradient mask where
   content meets the floating nav — only where they actually overlap.
3. **Material weight encodes hierarchy.** Heavier/darker surfaces for structure
   (sidebars in `/studio`), lighter for interactive elements. Never stack a light
   translucent surface on another — check the studio project page for this.
4. **Bigger surface = thicker material.** Modals get stronger blur + deeper shadow
   than chips. Currently everything uses the same `backdrop-blur-md`.
5. **Modals dim + push back the page** (scrim + slight scale-down of background);
   non-blocking panels use translucency and offset with *no* scrim.
6. **Materialize, don't fade.** Animate blur radius and scale together on sheet
   enter/exit so glass reads as arriving material.
7. **Retire the ambient blob glows** (`page.tsx:207-208`, the 500px `blur-[120px]`
   circles). They're a 2021 SaaS signature. Depth should come from material and
   shadow, not colored haze.

---

## Phase 4 — Motion and interaction feel

**Files:** all 12 files importing `framer-motion`, plus every `hover:scale-*` site

This is §1–§6 of the skill — the part that separates "fine" from "fluid."

1. **Feedback on pointer-down, not hover.** Replace all 26 `hover:scale-105/110`
   with `active:scale-[0.97]` at `120ms ease-out`. Buttons highlight the instant
   they're pressed, per §1.
2. **`transition-all` → `transition-[transform,opacity]`** across all 70 sites.
   Compositor-only properties, with `will-change` where motion is imminent.
3. **Springs replace duration curves** for anything gesture-driven. Default
   `springUI` (critically damped, no overshoot); reserve `springMoment` bounce for
   motion that *followed a flick or drag* (§4 — overshoot on a menu that faded in
   feels wrong).
4. **Spatial consistency (§7).** Every panel exits along its entry path. Popovers
   and dropdowns get `transform-origin` set to their trigger element so they scale
   *from* the button, not from their own center. Audit `NotificationBell.tsx`,
   `CreditBadge.tsx`, `ShareProjectDialog.tsx`, `DrawToEditModal.tsx`.
5. **Interruptibility (§3).** No modal or sheet may lock input during its
   transition. Animations start from the live presentation value, so a user can grab
   a closing sheet and it follows their finger instead of finishing first.

---

## Phase 5 — Gesture layer (studio + mobile)

**Files:** `src/app/studio/project/[projectId]/page.tsx` (8,627 lines), timeline and
storyboard components, mobile sheets

Highest effort, highest payoff for the product surface. Only worth doing after 1–4.

1. **1:1 drag tracking** with Pointer Events + `setPointerCapture`, respecting the
   grab offset (§2). Applies to timeline scrubbing, storyboard card reordering, and
   any bottom sheet.
2. **Velocity handoff (§5).** Track the last few `pointermove` events; hand release
   velocity to the spring so there's no seam between dragging and animating.
3. **Momentum projection (§6).** Snap to the target nearest the *projected*
   endpoint, not the release point:
   `current + (v/1000) * 0.998 / (1 - 0.998)`.
4. **Rubber-banding at boundaries (§9)** instead of hard stops on the timeline and
   any scroll-snap carousel.
5. **Decompose 2D drags into independent X and Y springs** (§3) so they don't desync.

---

## Phase 6 — Accessibility and polish

**Files:** `src/app/globals.css`, component-level

Per §14 — reduced motion means a gentler equivalent, not no feedback.

```css
@media (prefers-reduced-motion: reduce) {
  /* springs and slides → short opacity cross-fades; drop all overshoot */
}
@media (prefers-reduced-transparency: reduce) {
  /* raise background opacity, drop backdrop-filter */
}
@media (prefers-contrast: more) {
  /* near-solid backgrounds with defined contrasting borders */
}
```

Also: remove the infinite `animate-float` (6s loop) and `animate-pulse-slow` (4s) —
both sit near the 0.2 Hz slow-oscillation range the skill warns against. Bake the
three media queries into shared components rather than repeating them per-page.

---

## Sequencing

| Phase | Effort | Visual impact | Risk |
| --- | --- | --- | --- |
| 1 — Tokens | S | none (foundation) | none |
| 2 — Typography | M | **highest** | low, mechanical |
| 3 — Materials | M | high | medium (nav layout change) |
| 4 — Motion | M | high | low |
| 5 — Gestures | L | medium (studio only) | medium |
| 6 — A11y | S | none visible | none |

**Recommended first ship: Phases 1 + 2 + 6.** Tokens, typography, and reduced-motion
together are mostly find-and-replace, carry almost no regression risk, and deliver
the largest share of the "looks like Apple built it" change. Phase 3 next, since the
translucent nav is the most recognizable single move. Phases 4–5 are craft work that
pays off most inside `/studio`.

## What this plan deliberately does not do

Per Purpose (§16.1) — deciding what *not* to build:

- **No font swap.** Inter stays; brand consistency beats the system-font default here.
- **No light mode.** The product is dark-first and the skill's material rules work in
  dark. Adding a light theme is a separate project, not part of looking clean.
- **No copy rewrite.** Removing uppercase styling is design; rewriting the marketing
  message is not, and shouldn't be smuggled in under a design pass.
