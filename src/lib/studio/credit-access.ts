import "server-only"
import { createServiceClient } from "@/lib/supabase/service"

export function creditAccessAllowed(value: unknown, userId: string): boolean {
  const config = value as { enabled?: unknown; userIds?: unknown } | null
  return config?.enabled === true || (Array.isArray(config?.userIds) && config.userIds.includes(userId))
}

export async function hasPlatformCreditAccess(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().from("site_settings").select("value").eq("key", "platform_credit_access").maybeSingle()
  if (error) throw error
  return creditAccessAllowed(data?.value, userId)
}
