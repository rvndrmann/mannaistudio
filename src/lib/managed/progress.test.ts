import { describe, expect, it } from "vitest"
import { managedProgress } from "./progress"
import { managedChatContext } from "./chat-context"
import type { ManagedProjectRow } from "./server"
import type { ManagedDeliverable, ManagedVersion } from "@/components/managed/types"
const project = { id: "order-a", name: "My ad", payment_status: "paid", status: "production", video_count: 1, admin_note: "PRIVATE", studio_project_id: "team-private", brief: {}, delivery_due_at: null } as ManagedProjectRow
const deliverable = { id: "video-a", project_id: "order-a", title: "Ad", status: "approved" } as ManagedDeliverable
const version = { id: "version-a", project_id: "order-a", deliverable_id: "video-a", version_number: 1, is_final: true, storage_path: "managed/order-a/deliverables/final.mp4" } as ManagedVersion
describe("customer production progress and completed delivery", () => {
  it("does not invent an ETA and distinguishes generic steps from the team's plan", () => {
    const progress = managedProgress(project)
    expect(progress.expectedDeliveryAt).toBeNull()
    expect(progress.deliveryDateConfirmed).toBe(false)
    expect(progress.remainingTasksSource).toBe("stage")
    const planned = managedProgress({ ...project, client_update: "Recording voiceover", remaining_tasks: ["Sound mix", "Final review"], delivery_due_at: "2026-10-03T12:00:00Z" }, Date.parse("2026-10-01T12:00:00Z"))
    expect(planned.currentWork).toBe("Recording voiceover")
    expect(planned.remainingTasksSource).toBe("team")
    expect(planned.remainingTasks).toEqual(["Sound mix", "Final review"])
    expect(planned.overdue).toBe(false)
  })
  it("marks a late active order and clears remaining work after completion", () => {
    expect(managedProgress({ ...project, delivery_due_at: "2026-09-01T00:00:00Z" }).overdue).toBe(true)
    const done = managedProgress({ ...project, status: "completed", remaining_tasks: ["Stale task"], delivery_due_at: "2026-09-01T00:00:00Z" })
    expect(done.remainingTasks).toEqual([])
    expect(done.overdue).toBe(false)
  })
  it("requires a paid completed order and every final approved file", () => {
    expect(managedChatContext(project, [deliverable], [version]).fullDeliveryReady).toBe(false)
    const completed = { ...project, status: "completed" }
    expect(managedChatContext(completed, [deliverable], [version]).fullDeliveryReady).toBe(true)
    expect(managedChatContext({ ...completed, payment_status: "pending" }, [deliverable], [version]).fullDeliveryReady).toBe(false)
    expect(managedChatContext({ ...completed, video_count: 2 }, [deliverable], [version]).fullDeliveryReady).toBe(false)
    expect(managedChatContext(completed, [{ ...deliverable, status: "ready_for_review" }], [version]).fullDeliveryReady).toBe(false)
    expect(managedChatContext(completed, [deliverable], [{ ...version, is_final: false }]).fullDeliveryReady).toBe(false)
  })
  it("never includes internal notes, the team workspace, or foreign storage files", () => {
    const context = managedChatContext({ ...project, status: "completed" }, [deliverable], [version, { ...version, id: "foreign", storage_path: "another-owner/private/take.mp4", version_number: 10 }])
    expect(context.files).toHaveLength(1)
    expect(JSON.stringify(context)).not.toContain("PRIVATE")
    expect(JSON.stringify(context)).not.toContain("team-private")
    expect(JSON.stringify(context)).not.toContain("another-owner")
    expect(managedChatContext({ ...project, status: "completed" }, [deliverable], [{ ...version, project_id: "order-b" }]).files).toHaveLength(0)
  })
})
