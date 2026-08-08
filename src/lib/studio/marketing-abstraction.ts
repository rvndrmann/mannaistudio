export interface SocialConnection {
  id: string
  userId: string
  workspaceId: string
  platform: "instagram" | "facebook" | "x" | "linkedin"
  platformAccountId?: string
  platformAccountName?: string
  status: "connected" | "disconnected" | "expired" | "coming_soon"
  connectedAt?: string
  lastSyncedAt?: string
  permissions: string[]
}

export interface SocialProvider {
  connect(platform: string): Promise<{ success: boolean; redirectUrl?: string; message: string }>
  disconnect(connectionId: string): Promise<{ success: boolean }>
  publish(params: { connectionId: string; caption: string; mediaUrls: string[] }): Promise<{ success: boolean; postId?: string; message?: string }>
  schedule(params: { connectionId: string; scheduledAt: string; caption: string; mediaUrls: string[] }): Promise<{ success: boolean; jobId?: string }>
  getAnalytics(connectionId: string): Promise<Record<string, unknown>>
}

export interface AdsProvider {
  connectAccount(platform: string): Promise<{ success: boolean; message: string }>
  getAccounts(): Promise<Array<{ id: string; name: string; currency: string }>>
  createCampaign(params: { accountId: string; name: string; objective: string; dailyBudget: number }): Promise<{ campaignId?: string; status: string }>
  updateBudget(params: { campaignId: string; newDailyBudget: number }): Promise<{ success: boolean }>
  pauseCampaign(campaignId: string): Promise<{ success: boolean }>
  resumeCampaign(campaignId: string): Promise<{ success: boolean }>
  getPerformance(campaignId: string): Promise<Record<string, unknown>>
}

export interface CompetitorProvider {
  findCompetitor(query: string): Promise<Array<{ id: string; name: string; website?: string }>>
  getPublicContent(competitorId: string): Promise<Array<Record<string, unknown>>>
  getAds(competitorId: string): Promise<Array<Record<string, unknown>>>
}

export interface MediaAnalysisProvider {
  transcribeVideo(videoUrl: string): Promise<{ transcript: string }>
  extractOnScreenText(videoUrl: string): Promise<{ ocrText: string }>
  analyzeCreative(mediaUrl: string): Promise<{
    hook: string
    structure: Array<{ timestamp: string; section: string }>
    visualStyle: string
    marketingAngle: string
    analysisScore: number
  }>
}

export interface GuardrailSettings {
  maxDailyBudget: number
  maxMonthlyBudget: number
  maxDailyBudgetIncreasePct: number
  minAcceptableROAS: number
  maxAcceptableCPL: number
  allowedCountries: string[]
  allowedObjectives: string[]
  allowedPlatforms: string[]
}

export const defaultGuardrails: GuardrailSettings = {
  maxDailyBudget: 100,
  maxMonthlyBudget: 3000,
  maxDailyBudgetIncreasePct: 20,
  minAcceptableROAS: 2.0,
  maxAcceptableCPL: 30,
  allowedCountries: ["US", "CA", "GB", "AU"],
  allowedObjectives: ["lead_generation", "conversions", "reach"],
  allowedPlatforms: ["meta_ads", "linkedin_ads", "x_ads"],
}

export function validateActionAgainstGuardrails(
  action: { type: string; budget?: number; increasePct?: number; cpl?: number; country?: string },
  guardrails: GuardrailSettings = defaultGuardrails
): { allowed: boolean; reason?: string } {
  if (action.budget && action.budget > guardrails.maxDailyBudget) {
    return { allowed: false, reason: `Proposed daily budget ($${action.budget}) exceeds maximum allowed daily budget ($${guardrails.maxDailyBudget}).` }
  }
  if (action.increasePct && action.increasePct > guardrails.maxDailyBudgetIncreasePct) {
    return { allowed: false, reason: `Proposed budget increase (${action.increasePct}%) exceeds 24-hour limit (${guardrails.maxDailyBudgetIncreasePct}%).` }
  }
  if (action.cpl && action.cpl > guardrails.maxAcceptableCPL) {
    return { allowed: false, reason: `Cost per lead ($${action.cpl}) is above maximum acceptable threshold ($${guardrails.maxAcceptableCPL}).` }
  }
  if (action.country && !guardrails.allowedCountries.includes(action.country)) {
    return { allowed: false, reason: `Target country (${action.country}) is not in pre-approved list.` }
  }
  return { allowed: true }
}

export type ApprovalLevel = "NO_APPROVAL" | "APPROVAL_REQUIRED" | "AUTO_ALLOWED_WITH_GUARDRAILS"

export function getActionApprovalLevel(actionType: string): ApprovalLevel {
  switch (actionType) {
    case "read_analytics":
    case "analyze_performance":
    case "generate_recommendations":
      return "NO_APPROVAL"
    case "schedule_preapproved_content":
    case "reduce_budget":
    case "pause_campaign_on_cpl_spike":
      return "AUTO_ALLOWED_WITH_GUARDRAILS"
    case "publish_content":
    case "create_campaign":
    case "increase_budget":
    case "pause_campaign":
    default:
      return "APPROVAL_REQUIRED"
  }
}
