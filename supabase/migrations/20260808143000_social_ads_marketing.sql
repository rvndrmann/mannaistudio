-- Migration: Social Accounts, Content Calendar, Ads Manager, Competitor Intelligence & Marketing Agent
-- Description: Adds tables for social connections, content calendar, ad accounts, campaigns, competitor intelligence, agent activity logs, and feature flags.

CREATE TABLE IF NOT EXISTS public.social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'x', 'linkedin', 'tiktok', 'youtube')),
    platform_account_id TEXT,
    platform_account_name TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'expired', 'error', 'coming_soon')),
    connected_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    token_reference TEXT, -- Reference to server-side encrypted secret, NEVER raw OAuth token
    token_expires_at TIMESTAMPTZ,
    permissions JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    caption TEXT,
    hashtags TEXT[],
    cta TEXT,
    content_type TEXT NOT NULL CHECK (content_type IN ('image', 'video', 'reel', 'carousel', 'text', 'article')),
    media_urls TEXT[],
    shot_ids UUID[],
    platforms TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('idea', 'generating', 'draft', 'needs_approval', 'approved', 'scheduled', 'published', 'failed')),
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    campaign_name TEXT,
    approval_source TEXT DEFAULT 'manual',
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('meta_ads', 'linkedin_ads', 'x_ads', 'google_ads')),
    account_name TEXT NOT NULL,
    account_id TEXT NOT NULL,
    currency TEXT DEFAULT 'USD',
    timezone TEXT DEFAULT 'UTC',
    status TEXT NOT NULL DEFAULT 'coming_soon' CHECK (status IN ('active', 'paused', 'disabled', 'coming_soon')),
    credentials_reference TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    ad_account_id UUID REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('meta_ads', 'linkedin_ads', 'x_ads', 'google_ads')),
    name TEXT NOT NULL,
    objective TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'error')),
    daily_budget NUMERIC(12, 2) DEFAULT 0.00,
    spend NUMERIC(12, 2) DEFAULT 0.00,
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    leads BIGINT DEFAULT 0,
    conversions BIGINT DEFAULT 0,
    revenue NUMERIC(12, 2) DEFAULT 0.00,
    target_audience JSONB DEFAULT '{}'::jsonb,
    creatives JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    website TEXT,
    instagram_handle TEXT,
    facebook_page TEXT,
    x_handle TEXT,
    linkedin_page TEXT,
    meta_ad_library_url TEXT,
    industry TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.competitor_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    format_type TEXT CHECK (format_type IN ('video', 'image', 'carousel', 'text')),
    is_paid BOOLEAN DEFAULT false,
    media_url TEXT,
    thumbnail_url TEXT,
    hook_type TEXT,
    cta TEXT,
    offer TEXT,
    creative_style TEXT,
    marketing_angle TEXT,
    transcript TEXT,
    ocr_text TEXT,
    structure JSONB DEFAULT '[]'::jsonb,
    analysis_score INT DEFAULT 85,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    actor TEXT NOT NULL CHECK (actor IN ('ai_agent', 'user', 'system')),
    action TEXT NOT NULL,
    platform TEXT,
    target_object TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued', 'pending_approval', 'completed', 'failed', 'blocked')),
    approval_source TEXT DEFAULT 'manual',
    result JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.creator_projects(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'copilot' CHECK (mode IN ('manual', 'copilot', 'assisted_autopilot', 'full_autopilot')),
    max_daily_budget NUMERIC(12, 2) DEFAULT 100.00,
    max_monthly_budget NUMERIC(12, 2) DEFAULT 3000.00,
    max_daily_budget_increase_pct NUMERIC(5, 2) DEFAULT 20.00,
    min_acceptable_roas NUMERIC(5, 2) DEFAULT 2.00,
    max_acceptable_cpl NUMERIC(12, 2) DEFAULT 30.00,
    allowed_countries TEXT[] DEFAULT '{"US", "CA", "GB", "AU"}'::text[],
    allowed_objectives TEXT[] DEFAULT '{"lead_generation", "conversions", "reach"}'::text[],
    allowed_platforms TEXT[] DEFAULT '{"meta_ads", "linkedin_ads", "x_ads"}'::text[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own social connections" ON public.social_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own social posts" ON public.social_posts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own ad accounts" ON public.ad_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own ad campaigns" ON public.ad_campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own competitors" ON public.competitors FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own competitor creatives" ON public.competitor_creatives FOR ALL USING (
    EXISTS (SELECT 1 FROM public.competitors WHERE id = competitor_id AND user_id = auth.uid())
);
CREATE POLICY "Users access own agent actions" ON public.agent_actions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own automation rules" ON public.automation_rules FOR ALL USING (auth.uid() = user_id);
