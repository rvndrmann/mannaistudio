import { NextResponse } from "next/server"
import { managedErrorMessage, managedErrorStatus, requireUser } from "@/lib/managed/server"

export const dynamic = "force-dynamic"

/**
 * The client's managed projects, as the dashboard card needs them.
 *
 * Unpaid rows are left out. A checkout someone abandoned at the Razorpay sheet
 * leaves a `pending` project behind, and showing it on the dashboard as a live
 * campaign would be a lie about work nobody paid for. A proposal request is
 * different — it is a real thing we owe them an answer on, so it stays.
 */
export async function GET() {
  try {
    const { supabase, user } = await requireUser()

    const { data: projects, error } = await supabase
      .from("managed_projects")
      .select("id,name,service_type,status,payment_status,video_count,aspect_ratio,price_inr,created_at,updated_at,client_last_read_at")
      .eq("user_id", user.id)
      .in("payment_status", ["paid", "proposal_requested"])
      .order("created_at", { ascending: false })
    if (error) throw error

    const ids = (projects || []).map((project) => project.id)
    if (!ids.length) return NextResponse.json({ projects: [] })

    // Two fan-out queries rather than one per card: a client with a dozen
    // campaigns should not cost two dozen round trips to paint a list.
    const [{ data: deliverables }, { data: messages }] = await Promise.all([
      supabase.from("managed_deliverables").select("id,project_id,status").in("project_id", ids),
      supabase.from("managed_messages").select("project_id,created_at,sender_is_admin").in("project_id", ids),
    ])

    const summary = (projects || []).map((project) => {
      const own = (deliverables || []).filter((row) => row.project_id === project.id)
      const unread = (messages || []).filter(
        (row) =>
          row.project_id === project.id &&
          row.sender_is_admin &&
          (!project.client_last_read_at || row.created_at > project.client_last_read_at),
      ).length
      return {
        ...project,
        deliverableCount: own.length,
        readyCount: own.filter((row) => row.status === "ready_for_review").length,
        approvedCount: own.filter((row) => row.status === "approved").length,
        unreadMessages: unread,
      }
    })

    return NextResponse.json({ projects: summary })
  } catch (error) {
    return NextResponse.json(
      { error: managedErrorMessage(error, "Could not load your projects") },
      { status: managedErrorStatus(error) },
    )
  }
}
