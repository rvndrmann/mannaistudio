const NEGATION = String.raw`(?:do not|don't|never|without)`
// "Regenerate" has no word boundary before "generate", so `\bgenerate\b` never
// fired inside it: "do not regenerate the shot images" read as no refusal at
// all, and the image batch went ahead and re-rendered them. The message that
// existed to stop the spend was the one that authorised it.
const MEDIA_VERB = String.raw`(?:(?:re-?)?(?:generat(?:e|ing)|creat(?:e|ing)|mak(?:e|ing)|draw(?:ing)?|render(?:ing)?|produc(?:e|ing))|re-?do(?:ing)?)`
// "No more images" and "no further video" are refusals in the same breath as
// "no new images", and only the last of the three was recognised.
const MORE = String.raw`(?:new|more|further|additional|extra)`

export function forbidsMediaGeneration(message: string) {
  const value = message.toLowerCase()
  return new RegExp(String.raw`\b${NEGATION}\s+(?:yet\s+)?${MEDIA_VERB}\b`).test(value)
    || new RegExp(String.raw`\bno\s+(?:${MORE}\s+)?media\b`).test(value)
    || /\bread[- ]only\b/.test(value)
    || /\binspect only\b/.test(value)
}

export function forbidsImageGeneration(message: string) {
  const value = message.toLowerCase()
  return forbidsMediaGeneration(value)
    || new RegExp(String.raw`\b${NEGATION}\s+(?:yet\s+)?${MEDIA_VERB}\s+(?:any\s+)?(?:images?|keyframes?|posters?|visuals?)\b`).test(value)
    || new RegExp(String.raw`\bno\s+(?:${MORE}\s+)?(?:images?|keyframes?)\b`).test(value)
}

export function forbidsVideoGeneration(message: string) {
  const value = message.toLowerCase()
  return forbidsMediaGeneration(value)
    || new RegExp(String.raw`\b${NEGATION}\s+(?:yet\s+)?${MEDIA_VERB}\s+(?:any\s+)?(?:videos?|motion|animation)\b`).test(value)
    || new RegExp(String.raw`\bno\s+(?:${MORE}\s+)?(?:videos?|animation)\b`).test(value)
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
