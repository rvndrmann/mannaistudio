/**
 * What a revision actually changes.
 *
 * Every stage of a production is generated from a saved input: the script, the
 * prompt sheet, an entity's description, a shot's image prompt, a shot's video
 * prompt. Regenerating without editing that input reproduces what was there
 * before — the model is being handed the same words and asked for a different
 * answer. That is the failure this routing exists to prevent: a user says "make
 * her jacket red", the agent regenerates the frame from the unchanged prompt,
 * the jacket is still black, and the credits are spent.
 *
 * So a revision is an edit first and a regeneration second, and each thing a
 * user can ask to revise names the input that owns it.
 */

export const revisionTargetKeys = [
  "script",
  "prompt_sheet",
  "character",
  "asset",
  "location",
  "storyboard_image",
  "video_prompt",
  "look",
] as const

export type RevisionTargetKey = (typeof revisionTargetKeys)[number]

export type RevisionRoute = {
  key: RevisionTargetKey
  /** What the user calls it. */
  label: string
  /** The saved value that decides the output. */
  input: string
  /** The tool that edits that value. */
  tool: string
  /** What to do once it is edited, if anything. */
  after: string
}

export const revisionRoutes: RevisionRoute[] = [
  {
    key: "script",
    label: "the script, a scene, a line of dialogue, the runtime",
    input: "the episode's saved script",
    tool: "update_script",
    after: "Say which beats changed. The prompt sheet is written from the script, so offer to rewrite the affected prompts rather than leaving the sheet describing the old version.",
  },
  {
    key: "prompt_sheet",
    label: "what a shot is meant to show, before any art exists",
    input: "the saved prompt sheet entry for that shot",
    tool: "save_script_prompts",
    after: "Rewrite only the entries the user's note touches; replacing the whole sheet throws away prompts they already accepted.",
  },
  {
    key: "character",
    label: "a character's look, wardrobe, age, build, or name",
    input: "that entity's description in the asset library",
    tool: "update_asset",
    after: "The description drives the reference art, so regenerate that character's art after editing it, then offer to redo the shots whose keyframes still show the old look.",
  },
  {
    key: "asset",
    label: "a product, prop, or packaging detail",
    input: "that entity's description in the asset library",
    tool: "update_asset",
    after: "Regenerate its reference art if the change is visible, and leave shots alone unless the user asks — a prop change rarely needs every frame redone.",
  },
  {
    key: "location",
    label: "a place, set, or time of day",
    input: "that location entity's description",
    tool: "update_asset",
    after: "Regenerate the location plate, then offer the shots set there.",
  },
  {
    key: "storyboard_image",
    label: "the framing, composition, action, or lighting of a frame",
    input: "that shot's image prompt",
    tool: "update_shot with patch.prompt",
    after: "Then regenerate that shot's keyframe. Never describe a referenced character's face, hair, build, or wardrobe in the prompt — their reference art defines that, and words describing appearance override the picture.",
  },
  {
    key: "video_prompt",
    label: "camera movement, pacing, or what happens across the clip",
    input: "that shot's video prompt",
    tool: "update_shot with patch.video_prompt, or write_shot_video_prompts for several shots",
    after: "The image prompt and the video prompt are separate pieces of writing for different models; editing one must never overwrite the other. Regenerate the clip from the approved keyframe.",
  },
  {
    key: "look",
    label: "the overall style, palette, aspect ratio, or platform",
    input: "the project's creative brief",
    tool: "update_creative_brief",
    after: "This changes everything generated afterwards, so say so, and do not silently re-render work the user has already accepted.",
  },
]

/**
 * The revision rules the Director carries on every run.
 *
 * Written as instruction rather than as a lookup the model has to be asked for,
 * because the moment it matters is the moment the user says "change her jacket"
 * and the agent has to reach for an edit instead of a regeneration.
 */
export function revisionRoutingInstructions(): string {
  const lines = revisionRoutes.map(
    (route) => `- ${route.label} → edit ${route.input} with ${route.tool}. ${route.after}`,
  )
  return [
    "REVISIONS — changing something that already exists:",
    "A revision edits the saved input that produced the thing, and only then regenerates. Regenerating without editing the input hands the model the same words and asks for a different answer: the change does not happen and the credits are spent anyway. If you cannot find the input a request refers to, ask which shot, character, or scene they mean rather than guessing.",
    ...lines,
    "Apply the edit to every input the request implies, not only the one the user named: a character whose wardrobe changed needs their description edited and their art regenerated, and the shots that still show the old wardrobe are worth offering. Say what you changed, and what you left alone.",
    "A locked or approved asset is not revised unless the user names it. Never edit an input the user did not ask about to make a request easier to satisfy.",
    // "Updated the asset" tells the user nothing they can check. They need to
    // know which one, and to read the words that will actually be generated
    // from, without opening another tab to find out.
    "REPORTING AN EDIT: name every input you changed and quote the new text. For each one, give the thing's own name — the character's name, the asset's name, or the shot number — and then the exact prompt or description you saved, in full if it is short and as its opening sentences if it is long. Never say only that something was updated, and never paraphrase what you wrote: the user is checking the words the model will generate from, and a summary of them is not those words. If you changed several inputs, list them one per line in that form.",
  ].join("\n")
}
