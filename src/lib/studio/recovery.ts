export type DirectorRecovery = { code: string; message: string; recoverable: boolean; suggestedIntent?: string; suggestedLabel?: string }

export function directorRecovery(error: unknown): DirectorRecovery {
  const raw = error instanceof Error ? error.message : String(error || "Unknown workflow error")
  const value = raw.toLowerCase()
  if (value.includes("too many") || value.includes("return limit") || value.includes("row") && value.includes("limit")) return { code: "result_limit", message: "The query returned more records than one tool response can safely carry. I can retry it in smaller pages.", recoverable: true, suggestedIntent: "Retry the failed query in pages of 20 records", suggestedLabel: "Retry in smaller batches" }
  if (value.includes("moderation") || value.includes("safety") || value.includes("blocked")) return { code: "safety_block", message: "The provider safety system blocked this generation. Review the creative intent and use a neutral, policy-compliant prompt before retrying.", recoverable: true, suggestedIntent: "Review the blocked prompt and propose a neutral policy-compliant alternative without changing the story intent", suggestedLabel: "Review and rewrite prompt" }
  if (value.includes("credit") || value.includes("balance")) return { code: "insufficient_credits", message: "The workflow cannot reserve the required generation credits.", recoverable: false }
  if (value.includes("not configured") || value.includes("api key")) return { code: "provider_configuration", message: "The selected generation provider is not configured on the server.", recoverable: false }
  if (value.includes("does not belong") || value.includes("not found")) return { code: "stale_reference", message: "A referenced project item no longer exists or does not belong to this project. Reload the current workspace before retrying.", recoverable: true, suggestedIntent: "Reload current project entities and storyboard, then retry the last valid step", suggestedLabel: "Reload workspace and retry" }
  return { code: "tool_failed", message: raw.slice(0, 1_000), recoverable: true, suggestedIntent: "Inspect the failed workflow step and retry it with corrected inputs", suggestedLabel: "Inspect and retry" }
}
