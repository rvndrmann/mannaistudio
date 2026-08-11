export const defaultDirectorModelId = "gpt-5.6"

export const defaultDirectorModels = [
  { id: "gpt-5.6", label: "GPT-5.6", status: "active" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", status: "active" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", status: "active" },
  { id: "gpt-5.5", label: "GPT-5.5", status: "active" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", status: "active" },
  { id: "gemini-3.6-pro", label: "Gemini 3.6 Pro", status: "active" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", status: "active" },
  { id: "kimi-2.5", label: "Kimi 2.5", status: "active" },
  { id: "deepseek-v4", label: "DeepSeek V4", status: "active" },
  { id: "glm-5.2", label: "GLM 5.2", status: "active" },
  { id: "dola-seed-2-1-turbo", label: "Dola Seed 2.1 Turbo", status: "active" },
  { id: "dola-seed-2-0", label: "Dola Seed 2.0", status: "active" },
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
