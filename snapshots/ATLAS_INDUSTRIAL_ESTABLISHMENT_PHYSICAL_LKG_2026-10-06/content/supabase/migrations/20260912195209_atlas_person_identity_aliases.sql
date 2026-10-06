CREATE TABLE IF NOT EXISTS public.atlas_person_identity_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.atlas_observation_subjects(subject_id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    alias_type TEXT NOT NULL,
    fingerprint_version TEXT NOT NULL,
    fingerprint_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_id, alias_type, fingerprint_version, fingerprint_hash)
);

CREATE INDEX IF NOT EXISTS idx_atlas_identity_alias_lookup 
ON public.atlas_person_identity_aliases(source_id, alias_type, fingerprint_version, fingerprint_hash);

ALTER TABLE public.atlas_person_identity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage identity aliases" ON public.atlas_person_identity_aliases 
FOR ALL USING (auth.role() = 'service_role');
