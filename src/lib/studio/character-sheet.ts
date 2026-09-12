/**
 * The turnaround sheet a character needs before anyone can draw them twice.
 *
 * Written as one prompt rather than assembled from the shot vocabulary
 * elsewhere in the studio: this is a reference document, not a scene, so it
 * takes no camera package, no look block and no composition line. The sections
 * are numbered because the image models keep the grid only when the layout is
 * spelled out as a list.
 */
export function characterSheetPrompt(description: string): string {
  const subject = (description || "").trim() || "the character in the reference image"
  return `A comprehensive photorealistic character reference sheet of ${subject}, organized in a clean cohesive grid layout. The image consists of three distinct sections. SECTION 1 (Left): Three full-body standing poses showing the character in front view, side profile view, and back view. SECTION 2 (Top Right): A horizontal row of headshot portraits displaying different facial expressions: neutral, happy, angry, sad, and surprised. SECTION 3 (Bottom): A row of extreme macro close-up inserts showing details: eye texture, hair texture, shoe details, fabric stitching, and accessories. Clean white studio background, soft even commercial lighting, 8k resolution, ultra-realistic photography style`
}

/**
 * A sheet is a wide grid. Rendering it at the project's vertical shot ratio
 * squeezes nine panels into a phone frame, which is the one shape it cannot be.
 */
export const CHARACTER_SHEET_ASPECT_RATIO = "16:9"
