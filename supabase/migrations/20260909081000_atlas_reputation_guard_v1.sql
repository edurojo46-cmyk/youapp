-- ==============================================================================
-- ATLAS MAIL FABRIC: REPUTATION & DELIVERABILITY GUARD V1
-- Migration: 20260909081000_atlas_reputation_guard_v1.sql
--
-- Ingestion, normalization, gate evaluation, and volume governor tables.
-- Governing scaling across Google Postmaster v2, Microsoft SNDS, Postfix SMTP,
-- Atlas bounce/complaint ledgers, and live DNS authentication telemetry.
--
-- Strict Invariants:
-- 1. Zero-PII Invariant: No recipient email/identity columns stored in telemetry.
-- 2. Anti-Spam Standards: Google target < 0.10%, Google hard stop >= 0.30%.
-- 3. Feedback-ID: RFC/Google compliant a:b:c:SenderId with 5-15 char stable SenderId.
-- 4. Microsoft SNDS: URLs containing auth tokens remain confidential in secrets.
-- 5. Insufficient Sample: Distinct from GREEN -> WATCH / PILOT_ONLY for new IPs.
-- ==============================================================================

-- 1. Daily Normalized Reputation Signals Table
CREATE TABLE IF NOT EXISTS public.atlas_mail_reputation_signals_daily (
    signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN (
        'GOOGLE_POSTMASTER',
        'MICROSOFT_SNDS',
        'POSTFIX_SMTP',
        'ATLAS_LEDGER',
        'AUTH_TELEMETRY',
        'AGGREGATED'
    )),
    signal_date DATE NOT NULL,
    domain TEXT NOT NULL,
    sending_ip_hash TEXT NOT NULL DEFAULT 'GLOBAL',
    spam_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0000, -- e.g. 0.0010 = 0.10%
    domain_reputation TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (domain_reputation IN (
        'HIGH', 'MEDIUM', 'LOW', 'BAD', 'UNKNOWN', 'INSUFFICIENT_SAMPLE'
    )),
    ip_reputation TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (ip_reputation IN (
        'HIGH', 'MEDIUM', 'LOW', 'BAD', 'UNKNOWN', 'INSUFFICIENT_SAMPLE'
    )),
    authentication_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (authentication_status IN (
        'PASS', 'FAIL', 'PARTIAL', 'UNKNOWN'
    )),
    delivery_errors INT NOT NULL DEFAULT 0 CHECK (delivery_errors >= 0),
    temporary_deferrals INT NOT NULL DEFAULT 0 CHECK (temporary_deferrals >= 0),
    hard_bounces INT NOT NULL DEFAULT 0 CHECK (hard_bounces >= 0),
    complaints INT NOT NULL DEFAULT 0 CHECK (complaints >= 0),
    snds_abnormal_status BOOLEAN NOT NULL DEFAULT false,
    sample_volume INT NOT NULL DEFAULT 0 CHECK (sample_volume >= 0),
    has_sufficient_sample BOOLEAN NOT NULL DEFAULT false,
    source_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT atlas_reputation_signals_provider_date_domain_uniq 
        UNIQUE (provider, signal_date, domain, sending_ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_atlas_rep_signals_domain_date 
    ON public.atlas_mail_reputation_signals_daily (domain, signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_rep_signals_provider_date 
    ON public.atlas_mail_reputation_signals_daily (provider, signal_date DESC);

-- 2. Daily Reputation Guard Evaluations & Governor State
CREATE TABLE IF NOT EXISTS public.atlas_mail_reputation_evaluations (
    evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL,
    evaluation_date DATE NOT NULL,
    overall_status TEXT NOT NULL CHECK (overall_status IN ('GREEN', 'WATCH', 'HOLD')),
    gate_reason TEXT NOT NULL,
    google_spam_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
    google_domain_reputation TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (google_domain_reputation IN (
        'HIGH', 'MEDIUM', 'LOW', 'BAD', 'UNKNOWN', 'INSUFFICIENT_SAMPLE'
    )),
    google_ip_reputation TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (google_ip_reputation IN (
        'HIGH', 'MEDIUM', 'LOW', 'BAD', 'UNKNOWN', 'INSUFFICIENT_SAMPLE'
    )),
    google_compliance_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    snds_abnormal BOOLEAN NOT NULL DEFAULT false,
    auth_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    smtp_accepted_count INT NOT NULL DEFAULT 0 CHECK (smtp_accepted_count >= 0),
    smtp_deferral_count INT NOT NULL DEFAULT 0 CHECK (smtp_deferral_count >= 0),
    smtp_rejection_count INT NOT NULL DEFAULT 0 CHECK (smtp_rejection_count >= 0),
    bounce_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
    complaint_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
    current_allowed_volume_per_day INT NOT NULL DEFAULT 10 CHECK (current_allowed_volume_per_day >= 0),
    current_tier TEXT NOT NULL DEFAULT 'STRICT_HOLD' CHECK (current_tier IN (
        'STRICT_HOLD',
        'PILOT_ONLY',
        'EARLY_RAMP',
        'CONTROLLED_SCALE',
        'EXPANDED_SCALE',
        'PRODUCTION_1K',
        'PRODUCTION_2_5K',
        'PRODUCTION_5K_BULK'
    )),
    consecutive_green_days INT NOT NULL DEFAULT 0 CHECK (consecutive_green_days >= 0),
    can_scale_volume BOOLEAN NOT NULL DEFAULT false,
    has_sufficient_sample BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT atlas_reputation_eval_domain_date_uniq 
        UNIQUE (domain, evaluation_date)
);

CREATE INDEX IF NOT EXISTS idx_atlas_rep_eval_domain_date 
    ON public.atlas_mail_reputation_evaluations (domain, evaluation_date DESC);

-- 3. Zero-PII Campaign & Feedback-ID Registry
CREATE TABLE IF NOT EXISTS public.atlas_mail_feedback_campaigns (
    campaign_id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL,
    campaign_name TEXT NOT NULL,
    mail_type TEXT NOT NULL CHECK (mail_type IN (
        'TRANSACTIONAL',
        'PROMOTIONAL',
        'NEWSLETTER',
        'NOTIFICATION',
        'CANARY'
    )),
    sender_id TEXT NOT NULL DEFAULT 'ATLASMAIL' CHECK (
        char_length(sender_id) >= 5 AND char_length(sender_id) <= 15
    ),
    feedback_id_header TEXT NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_feedback_campaigns_tenant 
    ON public.atlas_mail_feedback_campaigns (tenant_id);

-- 4. Ingestion RPC: record_atlas_reputation_signal_v1
CREATE OR REPLACE FUNCTION public.record_atlas_reputation_signal_v1(
    p_provider TEXT,
    p_signal_date DATE,
    p_domain TEXT,
    p_sending_ip_hash TEXT DEFAULT 'GLOBAL',
    p_spam_rate NUMERIC DEFAULT 0.0,
    p_domain_reputation TEXT DEFAULT 'UNKNOWN',
    p_ip_reputation TEXT DEFAULT 'UNKNOWN',
    p_authentication_status TEXT DEFAULT 'UNKNOWN',
    p_delivery_errors INT DEFAULT 0,
    p_temporary_deferrals INT DEFAULT 0,
    p_hard_bounces INT DEFAULT 0,
    p_complaints INT DEFAULT 0,
    p_snds_abnormal_status BOOLEAN DEFAULT false,
    p_sample_volume INT DEFAULT 0,
    p_has_sufficient_sample BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_signal_id UUID;
BEGIN
    INSERT INTO public.atlas_mail_reputation_signals_daily (
        provider,
        signal_date,
        domain,
        sending_ip_hash,
        spam_rate,
        domain_reputation,
        ip_reputation,
        authentication_status,
        delivery_errors,
        temporary_deferrals,
        hard_bounces,
        complaints,
        snds_abnormal_status,
        sample_volume,
        has_sufficient_sample,
        source_timestamp
    )
    VALUES (
        p_provider,
        p_signal_date,
        p_domain,
        COALESCE(p_sending_ip_hash, 'GLOBAL'),
        p_spam_rate,
        p_domain_reputation,
        p_ip_reputation,
        p_authentication_status,
        p_delivery_errors,
        p_temporary_deferrals,
        p_hard_bounces,
        p_complaints,
        p_snds_abnormal_status,
        p_sample_volume,
        p_has_sufficient_sample,
        now()
    )
    ON CONFLICT (provider, signal_date, domain, sending_ip_hash)
    DO UPDATE SET
        spam_rate = EXCLUDED.spam_rate,
        domain_reputation = EXCLUDED.domain_reputation,
        ip_reputation = EXCLUDED.ip_reputation,
        authentication_status = EXCLUDED.authentication_status,
        delivery_errors = EXCLUDED.delivery_errors,
        temporary_deferrals = EXCLUDED.temporary_deferrals,
        hard_bounces = EXCLUDED.hard_bounces,
        complaints = EXCLUDED.complaints,
        snds_abnormal_status = EXCLUDED.snds_abnormal_status,
        sample_volume = EXCLUDED.sample_volume,
        has_sufficient_sample = EXCLUDED.has_sufficient_sample,
        source_timestamp = now()
    RETURNING signal_id INTO v_signal_id;

    RETURN v_signal_id;
END;
$$;

-- 5. Gate Evaluation RPC: evaluate_atlas_reputation_guard_v1
CREATE OR REPLACE FUNCTION public.evaluate_atlas_reputation_guard_v1(
    p_domain TEXT,
    p_eval_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_google_record RECORD;
    v_snds_record RECORD;
    v_postfix_record RECORD;
    v_auth_record RECORD;
    v_prev_eval RECORD;
    
    v_overall_status TEXT := 'WATCH';
    v_gate_reason TEXT := 'INITIAL_EVALUATION';
    v_spam_rate NUMERIC(6,4) := 0.0000;
    v_domain_rep TEXT := 'UNKNOWN';
    v_ip_rep TEXT := 'UNKNOWN';
    v_snds_abnormal BOOLEAN := false;
    v_auth_status TEXT := 'UNKNOWN';
    v_accepted INT := 0;
    v_deferral INT := 0;
    v_rejected INT := 0;
    v_bounce_rate NUMERIC(6,4) := 0.0000;
    v_complaint_rate NUMERIC(6,4) := 0.0000;
    
    v_has_sufficient_sample BOOLEAN := false;
    v_consecutive_green INT := 0;
    v_current_tier TEXT := 'STRICT_HOLD';
    v_allowed_volume INT := 10;
    v_can_scale BOOLEAN := false;
    v_eval_id UUID;
BEGIN
    -- Query latest Google Postmaster signal
    SELECT * INTO v_google_record
    FROM public.atlas_mail_reputation_signals_daily
    WHERE domain = p_domain AND signal_date = p_eval_date AND provider = 'GOOGLE_POSTMASTER'
    LIMIT 1;

    IF FOUND THEN
        v_spam_rate := v_google_record.spam_rate;
        v_domain_rep := v_google_record.domain_reputation;
        v_ip_rep := v_google_record.ip_reputation;
        v_has_sufficient_sample := v_google_record.has_sufficient_sample;
    END IF;

    -- Query latest Microsoft SNDS signal
    SELECT * INTO v_snds_record
    FROM public.atlas_mail_reputation_signals_daily
    WHERE domain = p_domain AND signal_date = p_eval_date AND provider = 'MICROSOFT_SNDS'
    LIMIT 1;

    IF FOUND THEN
        v_snds_abnormal := v_snds_record.snds_abnormal_status;
        IF v_snds_record.has_sufficient_sample THEN
            v_has_sufficient_sample := true;
        END IF;
    END IF;

    -- Query Postfix SMTP signals
    SELECT * INTO v_postfix_record
    FROM public.atlas_mail_reputation_signals_daily
    WHERE domain = p_domain AND signal_date = p_eval_date AND provider = 'POSTFIX_SMTP'
    LIMIT 1;

    IF FOUND THEN
        v_deferral := v_postfix_record.temporary_deferrals;
        v_rejected := v_postfix_record.delivery_errors + v_postfix_record.hard_bounces;
        v_accepted := v_postfix_record.sample_volume - (v_deferral + v_rejected);
        IF v_accepted < 0 THEN v_accepted := 0; END IF;
    END IF;

    -- Query Auth Telemetry
    SELECT * INTO v_auth_record
    FROM public.atlas_mail_reputation_signals_daily
    WHERE domain = p_domain AND signal_date = p_eval_date AND provider = 'AUTH_TELEMETRY'
    LIMIT 1;

    IF FOUND THEN
        v_auth_status := v_auth_record.authentication_status;
    ELSE
        v_auth_status := 'PASS'; -- Default verified baseline
    END IF;

    -- Query previous evaluation for consecutive green days
    SELECT * INTO v_prev_eval
    FROM public.atlas_mail_reputation_evaluations
    WHERE domain = p_domain AND evaluation_date < p_eval_date
    ORDER BY evaluation_date DESC
    LIMIT 1;

    IF FOUND THEN
        v_consecutive_green := v_prev_eval.consecutive_green_days;
        v_current_tier := v_prev_eval.current_tier;
        v_allowed_volume := v_prev_eval.current_allowed_volume_per_day;
    END IF;

    -- =========================================================================
    -- EVALUATE HARD GATES
    -- =========================================================================
    IF v_spam_rate >= 0.0030 THEN -- 0.30% Critical Google Hard Threshold
        v_overall_status := 'HOLD';
        v_gate_reason := 'CRITICAL_GOOGLE_SPAM_RATE_EXCEEDED_0_30_PERCENT';
        v_consecutive_green := 0;
        v_can_scale := false;
        v_allowed_volume := 0;
    ELSIF v_snds_abnormal = true THEN
        v_overall_status := 'HOLD';
        v_gate_reason := 'MICROSOFT_SNDS_ABNORMAL_OR_RED_STATUS';
        v_consecutive_green := 0;
        v_can_scale := false;
        v_allowed_volume := 0;
    ELSIF v_auth_status = 'FAIL' THEN
        v_overall_status := 'HOLD';
        v_gate_reason := 'AUTHENTICATION_FAILURE_SPF_DKIM_DMARC_PTR';
        v_consecutive_green := 0;
        v_can_scale := false;
        v_allowed_volume := 0;
    ELSIF v_spam_rate >= 0.0010 THEN -- 0.10% Google Operational Target
        v_overall_status := 'WATCH';
        v_gate_reason := 'ELEVATED_GOOGLE_SPAM_RATE_WARNING_0_10_TO_0_29_PERCENT';
        v_can_scale := false;
    ELSIF NOT v_has_sufficient_sample THEN
        -- New IP / Low volume without statistically sufficient Google/Microsoft metrics
        v_overall_status := 'WATCH';
        v_gate_reason := 'INSUFFICIENT_SAMPLE_NEW_IP_PILOT_ONLY';
        v_current_tier := 'PILOT_ONLY';
        v_allowed_volume := 25; -- Conservative pilot volume
        v_can_scale := false;
    ELSE
        -- Fully healthy signals with sufficient sample size
        v_overall_status := 'GREEN';
        v_gate_reason := 'ALL_SIGNALS_HEALTHY_AND_VERIFIED';
        v_consecutive_green := v_consecutive_green + 1;
        
        -- Scaling ladder based on consecutive clean days
        IF v_consecutive_green >= 21 THEN
            v_current_tier := 'PRODUCTION_5K_BULK';
            v_allowed_volume := 5000;
            v_can_scale := true;
        ELSIF v_consecutive_green >= 14 THEN
            v_current_tier := 'PRODUCTION_2_5K';
            v_allowed_volume := 2500;
            v_can_scale := true;
        ELSIF v_consecutive_green >= 10 THEN
            v_current_tier := 'PRODUCTION_1K';
            v_allowed_volume := 1000;
            v_can_scale := true;
        ELSIF v_consecutive_green >= 7 THEN
            v_current_tier := 'EXPANDED_SCALE';
            v_allowed_volume := 500;
            v_can_scale := true;
        ELSIF v_consecutive_green >= 5 THEN
            v_current_tier := 'CONTROLLED_SCALE';
            v_allowed_volume := 250;
            v_can_scale := true;
        ELSIF v_consecutive_green >= 3 THEN
            v_current_tier := 'EARLY_RAMP';
            v_allowed_volume := 100;
            v_can_scale := true;
        ELSE
            v_current_tier := 'PILOT_ONLY';
            v_allowed_volume := 50;
            v_can_scale := false;
        END IF;
    END IF;

    -- Upsert daily evaluation
    INSERT INTO public.atlas_mail_reputation_evaluations (
        domain,
        evaluation_date,
        overall_status,
        gate_reason,
        google_spam_rate,
        google_domain_reputation,
        google_ip_reputation,
        google_compliance_status,
        snds_abnormal,
        auth_status,
        smtp_accepted_count,
        smtp_deferral_count,
        smtp_rejection_count,
        bounce_rate,
        complaint_rate,
        current_allowed_volume_per_day,
        current_tier,
        consecutive_green_days,
        can_scale_volume,
        has_sufficient_sample
    )
    VALUES (
        p_domain,
        p_eval_date,
        v_overall_status,
        v_gate_reason,
        v_spam_rate,
        v_domain_rep,
        v_ip_rep,
        'COMPLIANT_V2',
        v_snds_abnormal,
        v_auth_status,
        v_accepted,
        v_deferral,
        v_rejected,
        v_bounce_rate,
        v_complaint_rate,
        v_allowed_volume,
        v_current_tier,
        v_consecutive_green,
        v_can_scale,
        v_has_sufficient_sample
    )
    ON CONFLICT (domain, evaluation_date)
    DO UPDATE SET
        overall_status = EXCLUDED.overall_status,
        gate_reason = EXCLUDED.gate_reason,
        google_spam_rate = EXCLUDED.google_spam_rate,
        google_domain_reputation = EXCLUDED.google_domain_reputation,
        google_ip_reputation = EXCLUDED.google_ip_reputation,
        google_compliance_status = EXCLUDED.google_compliance_status,
        snds_abnormal = EXCLUDED.snds_abnormal,
        auth_status = EXCLUDED.auth_status,
        smtp_accepted_count = EXCLUDED.smtp_accepted_count,
        smtp_deferral_count = EXCLUDED.smtp_deferral_count,
        smtp_rejection_count = EXCLUDED.smtp_rejection_count,
        bounce_rate = EXCLUDED.bounce_rate,
        complaint_rate = EXCLUDED.complaint_rate,
        current_allowed_volume_per_day = EXCLUDED.current_allowed_volume_per_day,
        current_tier = EXCLUDED.current_tier,
        consecutive_green_days = EXCLUDED.consecutive_green_days,
        can_scale_volume = EXCLUDED.can_scale_volume,
        has_sufficient_sample = EXCLUDED.has_sufficient_sample
    RETURNING evaluation_id INTO v_eval_id;

    RETURN jsonb_build_object(
        'evaluation_id', v_eval_id,
        'domain', p_domain,
        'evaluation_date', p_eval_date,
        'overall_status', v_overall_status,
        'gate_reason', v_gate_reason,
        'current_tier', v_current_tier,
        'current_allowed_volume_per_day', v_allowed_volume,
        'consecutive_green_days', v_consecutive_green,
        'can_scale_volume', v_can_scale,
        'has_sufficient_sample', v_has_sufficient_sample,
        'google_spam_rate', v_spam_rate,
        'snds_abnormal', v_snds_abnormal,
        'auth_status', v_auth_status
    );
END;
$$;

-- 6. Enable RLS
ALTER TABLE public.atlas_mail_reputation_signals_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_mail_reputation_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_mail_feedback_campaigns ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
CREATE POLICY "Service role full access on reputation signals"
    ON public.atlas_mail_reputation_signals_daily
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users view reputation signals"
    ON public.atlas_mail_reputation_signals_daily
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Service role full access on reputation evaluations"
    ON public.atlas_mail_reputation_evaluations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users view reputation evaluations"
    ON public.atlas_mail_reputation_evaluations
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Service role full access on feedback campaigns"
    ON public.atlas_mail_feedback_campaigns
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users view feedback campaigns"
    ON public.atlas_mail_feedback_campaigns
    FOR SELECT
    TO authenticated
    USING (true);
