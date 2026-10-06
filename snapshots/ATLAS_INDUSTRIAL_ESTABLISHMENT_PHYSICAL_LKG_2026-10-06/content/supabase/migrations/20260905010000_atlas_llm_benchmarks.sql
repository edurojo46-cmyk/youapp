-- ==========================================
-- ATLAS OUTREACH - LLM BENCHMARKS (PHASE 7C)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.atlas_llm_benchmarks (
    benchmark_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    gold_cases_count INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atlas_llm_benchmark_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_id UUID NOT NULL REFERENCES public.atlas_llm_benchmarks(benchmark_id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    pricing_snapshot JSONB NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.atlas_llm_benchmark_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.atlas_llm_benchmark_runs(run_id) ON DELETE CASCADE,
    benchmark_case_id TEXT NOT NULL, -- Logical ID of the case from the Gold dataset
    
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    reasoning_tokens INT NOT NULL DEFAULT 0,
    latency_ms INT NOT NULL DEFAULT 0,
    cost_estimate NUMERIC(10, 6) NOT NULL DEFAULT 0,
    
    claims_generated INT NOT NULL DEFAULT 0,
    claims_supported INT NOT NULL DEFAULT 0,
    claims_unsupported INT NOT NULL DEFAULT 0,
    claims_rejected INT NOT NULL DEFAULT 0,
    
    structured_output_ok BOOLEAN NOT NULL DEFAULT false,
    fallback_used BOOLEAN NOT NULL DEFAULT false,
    final_status TEXT NOT NULL CHECK (final_status IN ('APPROVED', 'REJECTED', 'ERROR')),
    
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_benchmark_results_run ON public.atlas_llm_benchmark_results(run_id);
