import { redirect } from "next/navigation"

/** The existing connection entry point now uses hosted, per-user OAuth. */
export default function StudioExternalAccessPage() {
  redirect("/connect/creator-studio")
}
