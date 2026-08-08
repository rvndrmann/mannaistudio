# AI Social Media + Advertising Agent Architecture

## Overview
AI Director Hub has been expanded from an AI video & content generation platform into an **AI Social Media + Advertising Agent**.

### Strategic Workflow
```
Brand / Business
  ↓
AI Strategy
  ↓
Content Creation (Studio Video & Image Generation)
  ↓
Content Calendar (Month / Week / List Views)
  ↓
Social Publishing (Instagram, Facebook, X, LinkedIn)
  ↓
Organic Analytics
  ↓
Ads Manager (Meta Ads, LinkedIn Ads, X Ads)
  ↓
Advertising Analytics
  ↓
Competitor Intelligence (Ad Library Pattern Analysis)
  ↓
AI Recommendations
  ↓
Send Pattern to AI Director Studio (Original Content Variations)
  ↓
Repeat
```

---

## 1. Core Modules & UI Components
Located in `src/components/studio/marketing/`:

| Component | Description | Location |
| :--- | :--- | :--- |
| `MarketingAgentHome.tsx` | High-level operations dashboard & real-time audit activity feed | `/studio/project/[projectId]?tab=marketing` |
| `SocialConnectionCard.tsx` | Integration cards for Instagram, Facebook, X, and LinkedIn | `/studio/project/[projectId]?tab=social-accounts` |
| `ContentCalendar.tsx` | Month, Week, and List views with post composer and Studio asset picker | `/studio/project/[projectId]?tab=calendar` |
| `AutopilotPanel.tsx` | Manual, Copilot, and Full Autopilot configuration panel & guardrails | `/studio/project/[projectId]?tab=autopilot` |
| `AnalyticsDashboard.tsx` | Organic KPI cards, platform/time filters, & AI Performance Agent | `/studio/project/[projectId]?tab=analytics` |
| `AdsManager.tsx` | Paid acquisition dashboard, AI Ads prompt agent, & monetary guardrails | `/studio/project/[projectId]?tab=ads-manager` |
| `CompetitorIntelligence.tsx` | Competitor radar, creative breakdown, pattern analysis & Studio handoff | `/studio/project/[projectId]?tab=competitors` |
| `IntegrationsSettings.tsx` | Third-party API credentials, OAuth tokens, & provider status page | `/studio/project/[projectId]?tab=integrations` |
| `ComingSoonModal.tsx` | Reusable `ComingSoonBadge`, `DemoDataBadge`, & `FeatureUnavailableModal` | Shared UI modal system |

---

## 2. Server Abstraction Layer
Located in [`src/lib/studio/marketing-abstraction.ts`](file:///Users/apple/Downloads/upto%20june%20all%202026/june-%20next-2026/HOLD/all%20websites/mannaistudio/src/lib/studio/marketing-abstraction.ts):

### Interfaces
- `SocialProvider`: `connect()`, `disconnect()`, `publish()`, `schedule()`, `getAnalytics()`
- `AdsProvider`: `connectAccount()`, `getAccounts()`, `createCampaign()`, `updateBudget()`, `pauseCampaign()`, `resumeCampaign()`, `getPerformance()`
- `CompetitorProvider`: `findCompetitor()`, `getPublicContent()`, `getAds()`
- `MediaAnalysisProvider`: `transcribeVideo()`, `extractOnScreenText()`, `analyzeCreative()`

### Deterministic Budget Guardrails
Every automated action is validated against strict backend rules via `validateActionAgainstGuardrails()`:
- `maxDailyBudget` (Default: $100.00)
- `maxMonthlyBudget` (Default: $3,000.00)
- `maxDailyBudgetIncreasePct` (Default: 20%)
- `minAcceptableROAS` (Default: 2.0x)
- `maxAcceptableCPL` (Default: $30.00)
- `allowedCountries` (Default: `["US", "CA", "GB", "AU"]`)

---

## 3. Database Schema
Defined in migration [`supabase/migrations/20260808143000_social_ads_marketing.sql`](file:///Users/apple/Downloads/upto%20june%20all%202026/june-%20next-2026/HOLD/all%20websites/mannaistudio/supabase/migrations/20260808143000_social_ads_marketing.sql):

- `social_connections`: Tracks platform account status, token references (server-encrypted), permissions.
- `social_posts`: Draft, scheduled, and published social content with Studio shot references.
- `ad_accounts`: Connected ad account metadata (Meta Ads, LinkedIn Ads, X Ads).
- `ad_campaigns`: Campaigns, objectives, spend, leads, CPL, and ROAS.
- `competitors`: Tracked competitor brands, Meta Ad Library URLs, and industry notes.
- `competitor_creatives`: Analyzed competitor ads with transcript, OCR, hook, and structure breakdown.
- `agent_actions`: Real-time audit log of all manual and AI-agent actions.
- `automation_rules`: Per-workspace deterministic monetary and platform guardrails.

---

## 4. Centralized Feature Flags
Managed in [`src/lib/studio/feature-flags.ts`](file:///Users/apple/Downloads/upto%20june%20all%202026/june-%20next-2026/HOLD/all%20websites/mannaistudio/src/lib/studio/feature-flags.ts):
Unconfigured integrations default to `false` and display the `COMING SOON` modal. When OAuth credentials are configured, turning the corresponding flag to `true` activates live publishing without requiring UI rebuilds.
