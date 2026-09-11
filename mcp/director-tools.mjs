import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The director's tool names, read from the registry that defines them.
 *
 * Written out by hand this list went stale the first time a tool was added, and
 * the failure is a poor one: the bridge rejects a name the server would have
 * accepted, so a tool that exists looks unavailable. Parsing the registry keeps
 * one source of truth; the fallback covers a bridge running away from the repo.
 */
const FALLBACK = [
  "read_tool_output", "inspect_current_project", "read_episode_script", "save_script_prompts",
  "write_episode_master_prompt", "read_episode_master_prompt", "read_script_prompts",
  "search_episode_script", "list_production_entities", "list_storyboard_shots",
  "update_creative_brief", "create_series", "write_series_bible", "create_production_entity",
  "create_production_entities_batch", "create_storyboard_batch", "validate_production",
  "record_continuity_fact", "inspect_continuity", "estimate_generation_cost",
  "inspect_generation_jobs", "submit_generation", "generate_entity_reference_art",
  "update_script", "update_shot", "write_shot_video_prompts", "fix_shot_aspect_mismatch",
  "delete_shot", "update_asset", "accept_existing_art", "attach_media_to_asset",
  "delete_asset", "attach_media_to_shot", "update_full_auto_mode", "create_revision_request",
]

let cached = null

export async function directorToolNames() {
  if (cached) return cached
  try {
    const source = await readFile(join(here, "..", "src", "lib", "studio", "tool-registry.ts"), "utf8")
    const block = source.split("export const directorTools = {")[1]?.split("} as const")[0]
    const names = Array.from(block.matchAll(/^\s{2}([a-z_]+):/gm)).map((match) => match[1])
    cached = names.length > 10 ? names : FALLBACK
  } catch {
    cached = FALLBACK
  }
  return cached
}
