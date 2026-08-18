export type BrandAttachment = { path: string; url: string; name: string; kind: string }

export type BrandView = {
  id: string
  user_id: string
  name: string
  kind: string
  tagline: string
  website_url: string
  industry: string
  description: string
  brand_voice: string
  audience: string
  positioning: string
  goals: string
  offer: string
  visual_style: string
  color_palette: string[]
  do_rules: string
  dont_rules: string
  forbidden_claims: string[]
  logo_path: string
  default_aspect: string
  website_snapshot: string
  website_pages: Array<{ url: string; title: string }>
  website_fetched_at: string | null
  website_error: string
  widget_enabled: boolean
  widget_greeting: string
  widget_agent_key: string
  updated_at: string
}

export type BrandLeadView = {
  id: string
  name: string
  email: string
  phone: string
  company: string
  intent: string
  message_count: number
  source_path: string
  captured_at: string | null
  created_at: string
  transcript: Array<{ role: "visitor" | "agent"; content: string; at: string }>
}

export type BrandAgentView = {
  agent_key: string
  name: string
  role_summary: string
  instructions: string
  writes_script: boolean
  enabled: boolean
  builtin: boolean
}

export type BrandChatView = { id: string; title: string; agent_key: string; updated_at: string }

export type BrandMessageView = {
  id: string
  role: "user" | "assistant"
  agent_key: string
  content: string
  attachments: BrandAttachment[]
  /** What the agent changed on the brand during this turn. */
  tool_notes: string[]
  created_at: string
}

export type BrandKnowledgeView = {
  id: string
  kind: string
  title: string
  content: string
  url: string
  pinned: boolean
  created_at: string
}

export type BrandAssetView = {
  id: string
  kind: string
  name: string
  description: string
  storage_path: string
  external_url: string
  created_at: string
}

export type BrandScriptContent = { title: string; overview: string; body: string; scenes: unknown[] }

export type BrandScriptView = {
  id: string
  title: string
  status: "draft" | "final"
  content: BrandScriptContent
  notes: string
  chat_id: string | null
  sent_project_id: string | null
  sent_episode_id: string | null
  sent_at: string | null
  updated_at: string
}

export type BrandWorkspaceData = {
  brand: BrandView
  knowledge: BrandKnowledgeView[]
  assets: BrandAssetView[]
  agents: BrandAgentView[]
  chats: BrandChatView[]
  scripts: BrandScriptView[]
  canEdit: boolean
}
