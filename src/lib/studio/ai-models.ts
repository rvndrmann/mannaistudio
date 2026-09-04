export const defaultDirectorModelId = "gpt-5.6-luna"

// The Director runs on one model. Gemini 3.6 Flash was retired from the chat
// catalog deliberately: `normalizeDirectorModels` below drops any stored id it
// does not find here, so taking it out of this list also takes it out of the
// Studio selector and out of any model list an admin saved earlier.
export const defaultDirectorModels = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", status: "active" },
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
