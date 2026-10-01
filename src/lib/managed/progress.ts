import { MANAGED_STATUS_LABELS, MANAGED_STATUS_BLURBS } from "@/lib/managed-production"

export type ManagedPlan = {
  status: string
  delivery_due_at?: string | null
  client_update?: string | null
  remaining_tasks?: string[] | null
  completed_at?: string | null
}
const remainingByStage: Record<string, string[]> = {
  brief_received: ["Research and creative direction", "Script and storyboard", "Production", "Client review", "Final exports and delivery"],
  creative_research: ["Script and storyboard", "Production", "Client review", "Final exports and delivery"],
  script_in_progress: ["Script approval", "Production", "Client review", "Final exports and delivery"],
  script_review: ["Your script feedback or approval", "Production", "Client review", "Final exports and delivery"],
  production: ["Finish production", "First cut and client review", "Final exports and delivery"],
  first_cut: ["Your feedback or approval", "Apply any agreed revisions", "Final exports and delivery"],
  revision_requested: ["Apply requested revisions", "Client approval", "Final exports and delivery"],
  finalizing: ["Final exports", "Final approval and delivery"],
}
export function managedProgress(project: ManagedPlan, now = Date.now()) {
  const closed = project.status === "completed" || project.status === "cancelled"
  const due = project.delivery_due_at && Number.isFinite(Date.parse(project.delivery_due_at)) ? project.delivery_due_at : null
  return {
    stage: project.status, stageLabel: MANAGED_STATUS_LABELS[project.status] || "In progress",
    currentWork: (closed ? MANAGED_STATUS_BLURBS[project.status] : project.client_update?.trim()) || MANAGED_STATUS_BLURBS[project.status] || "The team is preparing an update.",
    remainingTasks: closed ? [] : project.remaining_tasks?.length ? project.remaining_tasks : remainingByStage[project.status] || ["The team will confirm next steps"],
    remainingTasksSource: project.remaining_tasks?.length ? "team" : "stage",
    expectedDeliveryAt: due,
    deliveryDateConfirmed: Boolean(due),
    overdue: Boolean(due && !closed && Date.parse(due) < now),
    needsClientAction: ["script_review", "first_cut"].includes(project.status),
    completed: project.status === "completed",
    completedAt: project.completed_at || null,
  }
}
