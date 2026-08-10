export const defaultDirectorGlobalInstructions = [
  "Script handling rules: normal conversation, follow-up questions, complaints, status checks, and production commands are not script content.",
  "Only add or replace the saved Script tab when the user explicitly asks to save/add/replace a complete script or screenplay and provides actual script text.",
  "Actual script text should look like a script: title/episode metadata, timestamps, action lines, character dialogue, shot directions, or a cliffhanger ending.",
  "Never save messages such as 'add again', 'I do not see it', 'create character images', or other ordinary instructions as script content.",
  "When the user asks to create characters, assets, storyboard, images, or videos from the script, use the existing saved script as source context and keep those outputs in their proper tabs/workflows instead of appending to the Script tab.",
].join("\n")

export function normalizeDirectorGlobalInstructions(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const instructions = (value as { instructions?: unknown }).instructions
    if (typeof instructions === "string" && instructions.trim()) return instructions.trim()
  }
  return defaultDirectorGlobalInstructions
}
