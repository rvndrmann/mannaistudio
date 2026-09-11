export const defaultDirectorModelId = "gpt-5.6-luna"

// This list is the whole catalog: `normalizeDirectorModels` below drops any
// stored id it does not find here, so a model is in the Studio selector only
// while it is in this list, whatever an admin saved earlier.
// `byok: false` marks a model with no customer-key route, so every turn on it
// bills the platform. It is catalog truth, not a setting: `normalizeDirectorModels`
// rebuilds each entry from the id, label and status alone, so nothing stored in
// site_settings can flip it.
export const defaultDirectorModels = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", status: "active", byok: true },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash", status: "active", byok: true },
  // Claude runs at two efforts, and the effort is part of the id because every
  // consumer downstream — the rate card, the credit charge, the pause switch —
  // keys on the id alone. See `claudeDirectorModel` in studio/anthropic.ts.
  { id: "claude-opus-5-high", label: "Claude Opus 5 (High)", status: "active", byok: false },
  { id: "claude-opus-5-low", label: "Claude Opus 5 (Low)", status: "active", byok: false },
  { id: "claude-opus-4-8-high", label: "Claude Opus 4.8 (High)", status: "active", byok: false },
  { id: "claude-opus-4-8-low", label: "Claude Opus 4.8 (Low)", status: "active", byok: false },
] as const

export type DirectorModelStatus = "active" | "paused"
export type DirectorModelConfig = {
  id: string
  label: string
  status: DirectorModelStatus
}

export function normalizeDirectorModels(value: unknown): DirectorModelConfig[] {
  const configured = Array.isArray(value) ? value : []
  const defaults: DirectorModelConfig[] = defaultDirectorModels.map((model) => ({ ...model }))
  const merged = new Map<string, DirectorModelConfig>(defaults.map((model) => [model.id, model]))

  for (const item of configured) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Record<string, unknown>
    const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
    if (!id) continue
    // Stored settings can only adjust models that still exist in the catalog.
    // A retired model left behind in site_settings must not reappear in the
    // Studio selector just because the admin panel last saved it.
    if (!merged.has(id)) continue
    merged.set(id, {
      id,
      label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : id,
      status: candidate.status === "paused" ? "paused" : "active",
    })
  }

  return Array.from(merged.values())
}

export function activeDirectorModels(value: unknown): DirectorModelConfig[] {
  return normalizeDirectorModels(value).filter((model) => model.status === "active")
}
