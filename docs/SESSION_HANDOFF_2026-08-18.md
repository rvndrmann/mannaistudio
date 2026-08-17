# Session handoff - 2026-08-18

Two themes. The first is that the interface had no shared vocabulary — seven corner radii, five transition durations, `font-black` on 160 elements and `uppercase` on 271 — so nothing could read as more important than anything else, and every component had to invent its own answer. The second is that the studio was built for a desk: below 1280px the AI Director chat was not cramped, it was `hidden`, and the fullscreen editors stacked 600px of fixed chrome onto a 390px screen. A phone could not use the product.

Underneath both, one recurring lesson about verification: three separate times a "bug" turned out to be the measuring instrument, and twice a fix reported as applied had silently matched nothing.

## A design system the interface can defend

Tokens first, in `globals.css` and `tailwind.config.ts`, because every later change needed something to refer to.

- **Type carries size-specific tracking and leading.** A single `letter-spacing` is wrong somewhere: large text reads too loose as it grows and wants negative tracking, small text wants a touch of positive. Display sits at `-0.03em` / `1.05`, body at `0` / `1.6`. Weight tops out at **600** — presence in the large sizes comes from tight leading and negative tracking, not from the heaviest cut of the face.
- **Four radii and three durations** replace the ad-hoc values. `--radius` had been declared and then ignored by every component.
- **Springs for anything a user can touch** (`src/lib/motion.ts`). A fixed-duration curve cannot respond to new input once it starts; a spring can, because new input only moves the target.
- **Feedback moved from hover to press.** 26 `hover:scale-105` became `active:scale-[0.97]`. A control that swells when the cursor merely passes over it is reacting to something the user has not done yet.
- **`transition-all` on 70 elements** animated layout properties off the compositor; these are transform and opacity only now.
- **Chrome is real material** — `backdrop-filter` with content scrolling underneath, replacing an opaque bar that reserved a 112px strip of the hero.
- **Lime is the only accent.** Cyan, fuchsia and amber were each claiming to be the important thing on the same screen. A second accent colour does not add a second level of hierarchy, it splits the eye.
- **`prefers-reduced-motion`, `-transparency` and `-contrast` are honoured**, which the site previously ignored entirely. Reduced motion keeps the press feedback and drops only the travel and the overshoot.

## The studio on a phone

The chat panel was `hidden … xl:flex`. The core of the product did not exist below 1280px.

- **The Director is a bottom sheet below xl**, raised by a button over the canvas, dismissed by a scrim or a close control, docking as a column again at xl. The close button's row is tall enough to hold a 44px target — when it was not, the button hung past the row's bottom edge and the chat header, which comes later in the DOM, painted straight over it.
- **Both fullscreen editors scroll.** They live in a `fixed inset-0` overlay whose shell was `h-full` with `overflow: visible`. Side by side the three panes had always fitted the window exactly, so the shell never needed to scroll — and the moment they stacked, ~950px of the editor, the preview and every generation control included, could not be reached at all.
- **The asset comes before the form.** Controls were moved above the preview to make generating reachable, which fixed generating and broke looking: opening an editor to see what you made began with scrolling past the form for making another. The asset is why the screen exists, and a Generate button jumps to the controls in one tap.
- **Shot rows stack, image and video side by side.** They are the pair you compare, and stacked they cannot be compared.
- **All six tabs are visible at once** rather than scrolling out of view. Navigation you have to go hunting for cannot answer "where can I go".
- **`100vh` became `100dvh`**, and the body height is flex rather than a hardcoded `100vh - 48px` that only held while the header was one row — it now wraps to 171px.
- **226 labels below 12px are lifted on small screens only** (`.studio-dense`, `max-width: 767px`), so the desk keeps its density and the phone stays readable.

## The Director looked stuck while it was working

The stream already reported every tool as it started and finished. Each report overwrote the last, so minutes of work collapsed into one short line that changed occasionally and never moved — and a line that does not move reads as a hang. The information was being sent and thrown away.

Steps accumulate now: each tool adds a row when it starts and the row settles to a tick, a cross or an error when it finishes, the same tool reporting twice updating its own row. `streamingReply.steps.length` is in the autoscroll dependencies, so the conversation moves as rows appear. An elapsed counter runs alongside, because during the long stretches where no tool reports anything it is the only thing on screen that can prove the run is alive.

## The next step jumped to an unrelated shot

Asking to redo shot 7 ended with a keyframe generated for **shot 11**, and credits spent on the wrong shot.

The scope filter was working. The request parsed as `[7]` — confirmed by running the user's exact wording, typos included, through `parseTargetShotNumbers` — and the revision proposal was correctly prepared for shot 7. The fault was in the next-step offer appended after it.

`actionMatchesRequestedShots` ended with `every((number) => number > furthestRequested)`. That rule exists because finishing shot 1's keyframe used to end with no button at all, the pipeline having moved on to shot 2. But `> 7` does not mean "the next shot", it means any higher shot — and the pipeline reports the first shot *anywhere in the episode* that still needs work. Shot 11 was an unfinished job from earlier in the same session that the request had nothing to do with. A jump forward is as much a jump as a jump back; only `furthestRequested + 1` survives now.

An existing test asserted the old behaviour (`shot 4` allowed from `[1]`). It encoded the bug and was changed deliberately, with a regression test for the 7→11 case.

**Approval cards name their shot.** "Update storyboard shot" did not say which one, resolved in `ProposalCard` from the proposal's payload against the loaded storyboard. Without the number there was nothing on the card to catch this against — the proposal was right and the step after it was wrong, and both looked identical.

## What the verification kept getting wrong

Worth reading before trusting a measurement in this codebase.

- **A hidden browser pane throttles `requestAnimationFrame`.** Every Framer Motion animation freezes on its initial frame, so the mobile menu measured as `opacity: 0`, permanently. It was reported as a real defect before `document.visibilityState` was checked. It had been working the whole time.
- **Elements inside a horizontal scroller are not clipped.** A naive overflow check counted them and reported "45–79 overflowing elements" on every studio tab. Excluding elements with a scrollable ancestor, the real count was **0**. Layouts were nearly rebuilt that were fine.
- **`scrollIntoView({ behavior: "smooth" })` needs rAF too**, so it fails silently in the same pane while instant scroll works.
- **A `python .replace()` that matches nothing still prints "changed"** if any other replacement in the same script landed. Two fixes were reported as applied and were not: one matched `font-semibold` where the source said `font-bold`, and one matched a wrapper that only exists in the shot editor, so the asset editor's gallery never became a strip. Both were found later by measuring the rendered DOM, not by re-reading the script.

The one technique that did work: a same-origin `<iframe>` sized to 390px inside an authenticated tab. Media queries evaluate against the iframe's width, which gives a true mobile viewport for a page behind auth without touching the real window.

## Verification

- `npm run typecheck`
- `npm test` — 432 tests
- `npm run build`
- Measured in a 390px viewport, signed in: no horizontal scroll, 0 tap targets under 44px on the marketing pages, 0 text under 12px, all six studio tabs on screen, shot rows fitting 353px, 8 gallery thumbnails with 3 visible at once.

## Known gaps left open

- **The Director activity log and the shot-scoping fix are unverified against a live run.** Both compile, typecheck and build; neither has been watched driving a real agent, because a run spends the user's credits. The step labels come from the server's `event.label` and were not touched.
- **The asset-concept editor was never opened during the mobile work.** It received the same treatment as the shot editor by pattern-matching class strings, which is exactly the technique that silently failed twice above. Its gallery was verified; its generation controls were not.
- **Script, Characters & Assets, Timeline and Canvas measured clean but were never looked at.** Only Storyboard and Production were seen rendered.
- **Two gallery thumbnails rendered as empty dark rectangles** in the final check while measuring 68×51 correctly. Most likely images still loading in the test iframe; not confirmed on a real device.
- **Phases 5 of `APPLE_DESIGN_PLAN.md` is untouched** — the gesture layer (pointer capture, velocity handoff, momentum projection, rubber-banding). Phases 3–4 are partial: materials and press feedback are in, but `transform-origin` anchoring across `DrawToEditModal`, `ShareProjectDialog` and the other studio modals is not.
- **`CLAUDE.md` at the repo root still describes the old "AI Mastery" course platform** — course tables, PayU, challenges — none of which matches the current AI Director Hub. It was not touched this session and will mislead a fresh session that reads it as current.
- **`cinema-camera-assets 2/` is untracked** and was deliberately excluded from every commit this session. The trailing `2` suggests a duplicate; nobody has said what it is.
