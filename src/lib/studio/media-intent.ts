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
