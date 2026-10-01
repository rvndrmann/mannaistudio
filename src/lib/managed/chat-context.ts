import { isManagedClientPath } from "@/lib/managed-production"
import { managedProgress } from "./progress"
import type { ManagedProjectRow } from "./server"
import type { ManagedDeliverable, ManagedVersion } from "@/components/managed/types"

/** Only published client-facing versions qualify; never reference internal Studio. */
export function managedChatContext(project: ManagedProjectRow, deliverables: ManagedDeliverable[], versions: ManagedVersion[]) {
  const own = deliverables.filter((item) => item.project_id === project.id)
  const files = own.flatMap((deliverable) => {
    const published = versions.filter((version) => version.project_id === project.id && version.deliverable_id === deliverable.id && isManagedClientPath(project.id, version.storage_path))
    const final = published.filter((version) => version.is_final && deliverable.status === "approved").sort((a, b) => b.version_number - a.version_number)[0]
    const latest = [...published].sort((a, b) => b.version_number - a.version_number)[0]
    const version = project.status === "completed" ? final : latest
    if (!version) return []
    return [{ id: deliverable.id, title: deliverable.title, status: deliverable.status,
      versionNumber: version.version_number, note: version.note, isFinal: Boolean(final && version.id === final.id),
      storagePath: version.storage_path, durationSeconds: version.duration_seconds }]
  })
  const complete = project.payment_status === "paid" && project.status === "completed" && own.length >= project.video_count
    && own.every((item) => item.status === "approved") && files.length === own.length && files.every((file) => file.isFinal)
  return {
    project: { id: project.id, name: project.name, status: project.status, paymentStatus: project.payment_status,
      videoCount: project.video_count, durationSeconds: project.duration_seconds, aspectRatio: project.aspect_ratio },
    progress: managedProgress(project),
    fullDeliveryReady: complete,
    deliverables: own.map((item) => ({ id: item.id, title: item.title, status: item.status })), files,
  }
}
