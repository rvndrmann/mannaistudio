const NEGATION = String.raw`(?:do not|don't|never|without)`

export function forbidsMediaGeneration(message: string) {
  const value = message.toLowerCase()
  return new RegExp(String.raw`\b${NEGATION}\s+(?:yet\s+)?(?:generate|generating|create|creating|make|making|draw|drawing|render|rendering|produce|producing)\b`).test(value)
    || /\bno\s+(?:new\s+)?media\b/.test(value)
    || /\bread[- ]only\b/.test(value)
    || /\binspect only\b/.test(value)
}

export function forbidsImageGeneration(message: string) {
  const value = message.toLowerCase()
  return forbidsMediaGeneration(value)
    || new RegExp(String.raw`\b${NEGATION}\s+(?:yet\s+)?(?:generate|create|make|draw|render)\s+(?:any\s+)?(?:images?|keyframes?|posters?|visuals?)\b`).test(value)
    || /\bno\s+(?:new\s+)?(?:images?|keyframes?)\b/.test(value)
}

export function forbidsVideoGeneration(message: string) {
  const value = message.toLowerCase()
  return forbidsMediaGeneration(value)
    || new RegExp(String.raw`\b${NEGATION}\s+(?:yet\s+)?(?:generate|create|make|render|produce)\s+(?:any\s+)?(?:videos?|motion|animation)\b`).test(value)
    || /\bno\s+(?:new\s+)?(?:videos?|animation)\b/.test(value)
}

/**
 * A request to write, not to render.
 *
 * "Write a funny storyline for a 30 second video" says "video" and says
 * "create", which is all the video fast path looks for — so a user describing
 * the idea they want scripted was answered with a note about storyboard shots
 * they have not written yet. Naming a shot number is the tell that a message is
 * about existing footage; without one, an authoring verb aimed at written work
 * means the script stage, and the Director should draft it.
 */
export function requestsWrittenStory(message: string) {
  const value = message.toLowerCase()
  if (/\bshots?\s*#?\d+/.test(value)) return false
  const authoringVerb = /\b(write|writes|writing|written|draft|drafts|drafting|rewrite|rewrites|rewriting|brainstorm|outline|come up with|think of)\b/
  const writtenWork = /\b(scripts?|screenplays?|storylines?|stor(?:y|ies)|plots?|concepts?|treatments?|outlines?|synops(?:is|es)|loglines?|premises?|narratives?|dialogues?|ideas?)\b/
  return authoringVerb.test(value) && writtenWork.test(value)
}
