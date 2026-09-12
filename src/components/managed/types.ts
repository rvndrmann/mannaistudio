import type { ManagedAttachment, ManagedBrief } from "@/lib/managed-brief"

/** The shape `/api/managed/projects/[projectId]` returns. */

export type ManagedProject = {
  id: string
  user_id: string
  name: string
  service_type: string
  package_key: string
  brand_id: string | null
  studio_project_id: string | null
  brief: ManagedBrief
  offer_snapshot: unknown
  status: string
  video_count: number
  duration_seconds: number
  aspect_ratio: string
  revisions_included: number
  price_inr: number
  payment_status: string
  admin_note: string
  created_at: string
  updated_at: string
}

export type ManagedDeliverable = {
  id: string
  project_id: string
  title: string
  position: number
  status: string
  aspect_ratio: string
  revisions_used: number
}

export type ManagedVersion = {
  id: string
  deliverable_id: string
  project_id: string
  version_number: number
  label: string
  storage_path: string
  thumbnail_path: string
  duration_seconds: number | null
  note: string
  is_final: boolean
  created_at: string
}

export type ManagedMessage = {
  id: string
  project_id: string
  sender_id: string
  sender_is_admin: boolean
  kind: string
  body: string
  attachments: ManagedAttachment[]
  deliverable_id: string | null
  created_at: string
}

export type ManagedComment = {
  id: string
  project_id: string
  deliverable_id: string
  version_id: string | null
  author_id: string
  timestamp_seconds: number | null
  body: string
  attachments: ManagedAttachment[]
  resolved_at: string | null
  created_at: string
}

export type ManagedProjectPayload = {
  project: ManagedProject
  deliverables: ManagedDeliverable[]
  versions: ManagedVersion[]
  messages: ManagedMessage[]
  comments: ManagedComment[]
  viewer: { id: string; isAdmin: boolean; isOwner: boolean }
}
