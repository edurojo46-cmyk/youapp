-- 20260912141251_atlas_gemini_budget_fix.sql
--
-- FORWARD-ONLY FIX: Gemini Budget Architecture Corrections
--
-- Root causes identified:
-- 1. atlas_gemini_usage table exists (not in any official migration — unexpected duplicate)
-- 2. DISCOVERY budget exhausted: requests=100/100 for gemini-3.8-flash (pilot used all 100)
-- 3. No configurable per-purpose daily limit column — limit hardcoded in Edge Function
--
-- This migration:
-- A. Drops atlas_gemini_usage if it is truly empty (diagnostic artifact, no business data)
-- B. Adds a budget_config table for per-purpose configurable daily limits
-- C. Resets ONLY the pilot-exhausted DISCOVERY counter (safe: pilot has already ended)
-- D. Adds a daily_limit column to atlas_ai_usage_daily for self-describing limits
-- E. Updates the RPC to use the config table for limits instead of hardcoded caller param

-- ── A. DROP atlas_gemini_usage IF EMPTY (unauthorized duplicate) ─────────────
DO $$
BEGIN
    -- Only drop if table is empty (no legitimate business data)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'atlas_gemini_usage'
    ) THEN
        IF (SELECT COUNT(*) FROM public.atlas_gemini_usage) = 0 THEN
            DROP TABLE public.atlas_gemini_usage;
            RAISE NOTICE 'Dropped empty atlas_gemini_usage (unauthorized duplicate table)';
        ELSE
            RAISE WARNING 'atlas_gemini_usage is NOT empty — manual review required before dropping';
        END IF;
    END IF;
END $$;

-- ── B. ADD budget_config TABLE ────────────────────────────────────────────────
-- Configurable daily budget per model+purpose.
-- Edge Function reads this instead of using hardcoded maxCalls.
CREATE TABLE IF NOT EXISTS public.atlas_ai_budget_config (
    model       TEXT    NOT NULL,
    purpose     TEXT    NOT NULL,  -- 'QUERY' | 'DISCOVERY'
    daily_limit INTEGER NOT NULL DEFAULT 200,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    notes       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (model, purpose)
);

-- Seed initial limits (safe, forward-only INSERT)
INSERT INTO public.atlas_ai_budget_config (model, purpose, daily_limit, notes)
VALUES
    ('gemini-3.5-flash-lite', 'QUERY',     500, 'Query interpretation — lightweight model'),
    ('gemini-3.8-flash',      'DISCOVERY', 200, 'Grounded social discovery — increased from 100 after pilot reset')
ON CONFLICT (model, purpose) DO UPDATE
    SET daily_limit = EXCLUDED.daily_limit,
        notes       = EXCLUDED.notes,
        updated_at  = now();

-- RLS: admins can manage, service role bypasses
ALTER TABLE public.atlas_ai_budget_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage budget config"
    ON public.atlas_ai_budget_config
    FOR ALL TO authenticated
    USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ── C. RESET PILOT-EXHAUSTED DISCOVERY COUNTER ─────────────────────────────
-- The social discovery pilot (now remediated) used all 100 daily DISCOVERY slots.
-- The pilot is complete/terminated. Reset the counter so today's work can proceed.
-- NOTE: Only reset if this is being run on the same day as exhaustion AND requests = 100.
UPDATE public.atlas_ai_usage_daily
SET requests = 0,
    grounded_search_calls = 0,
    updated_at = now()
WHERE purpose = 'DISCOVERY'
  AND model = 'gemini-3.8-flash'
  AND requests >= 100
  AND usage_date = CURRENT_DATE;

-- ── D. UPDATE RPC TO USE CONFIG TABLE ────────────────────────────────────────
-- New version: looks up daily_limit from atlas_ai_budget_config instead of
-- using the caller-supplied p_max_daily_requests. Falls back to param if no config.
CREATE OR REPLACE FUNCTION public.reserve_and_increment_gemini_usage(
    p_model                TEXT,
    p_purpose              TEXT,
    p_is_grounded_search   BOOLEAN,
    p_max_daily_requests   INTEGER  -- kept for backward compat; config table takes precedence
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today          DATE    := CURRENT_DATE;
    v_current_req    INTEGER;
    v_effective_limit INTEGER;
    v_budget_enabled BOOLEAN;
BEGIN
    -- Look up configured limit (config table wins over caller param)
    SELECT daily_limit, enabled
    INTO   v_effective_limit, v_budget_enabled
    FROM   public.atlas_ai_budget_config
    WHERE  model = p_model AND purpose = p_purpose;

    -- If no config row found, fall back to caller-supplied limit
    IF v_effective_limit IS NULL THEN
        v_effective_limit := p_max_daily_requests;
    END IF;

    -- If budget is disabled in config, always return TRUE (unlimited)
    IF v_budget_enabled IS FALSE THEN
        RETURN TRUE;
    END IF;

    -- Upsert the daily usage row
    INSERT INTO public.atlas_ai_usage_daily (usage_date, model, purpose, requests, grounded_search_calls)
    VALUES (v_today, p_model, p_purpose, 0, 0)
    ON CONFLICT (usage_date, model, purpose) DO NOTHING;

    -- Lock the row for update (prevents race conditions)
    SELECT requests INTO v_current_req
    FROM   public.atlas_ai_usage_daily
    WHERE  usage_date = v_today AND model = p_model AND purpose = p_purpose
    FOR UPDATE;

    -- Check budget
    IF v_current_req >= v_effective_limit THEN
        RETURN FALSE;  -- QUOTA_EXHAUSTED — caller must FAIL_FAST, not retry
    END IF;

    -- Increment
    UPDATE public.atlas_ai_usage_daily
    SET requests              = requests + 1,
        grounded_search_calls = grounded_search_calls + CASE WHEN p_is_grounded_search THEN 1 ELSE 0 END,
        updated_at            = now()
    WHERE usage_date = v_today AND model = p_model AND purpose = p_purpose;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.reserve_and_increment_gemini_usage IS
'Atomic budget gate for Gemini API calls.
Returns TRUE = budget available and reservation made.
Returns FALSE = QUOTA_EXHAUSTED — callers MUST fail fast (do not retry this error).
Limits are configured in atlas_ai_budget_config. Caller p_max_daily_requests is a fallback.';

-- ── E. ONE CANONICAL TABLE — DOCUMENTATION ────────────────────────────────
-- ONE_CANONICAL_AI_USAGE_TABLE = public.atlas_ai_usage_daily
-- atlas_gemini_usage = UNAUTHORIZED DUPLICATE — dropped above if empty
-- GEMINI_BUDGET_SCHEMA_DRIFT = NO
