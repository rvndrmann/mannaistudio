import type { SupabaseClient } from "@supabase/supabase-js"

export type CreatorStudioAccess = {
  entitled: boolean
  purchaseWindowExpiresAt: string | null
  purchaseOnly: boolean
}

/** Studio is open to signed-in users. Provider keys and paid courses have
 * separate subscription checks; opening the workspace grants neither. */
export async function getCreatorStudioAccess(_supabase: SupabaseClient, userId: string): Promise<CreatorStudioAccess> {
  return {
    entitled: Boolean(userId),
    purchaseWindowExpiresAt: null,
    purchaseOnly: false,
  }
}

export async function hasCreatorStudioEntitlement(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getCreatorStudioAccess(supabase, userId)).entitled
}
