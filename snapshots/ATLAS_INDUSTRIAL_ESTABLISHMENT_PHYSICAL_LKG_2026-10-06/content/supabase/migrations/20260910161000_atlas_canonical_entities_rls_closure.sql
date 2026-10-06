-- Migration: 20260910161000_atlas_canonical_entities_rls_closure.sql
-- Description: Atlas Canonical Entities V1 — Explicit Write-Path RLS Policy Reinforcement (USING + WITH CHECK)
-- Subsystem: Semantic Intelligence / Canonical Entity Layer
-- Safety: Forward-only patch migration. Preserves 20260910160000 without modification.

-- ============================================================================
-- 1. ATLAS_CANONICAL_ENTITIES EXPLICIT RLS
-- ============================================================================

DROP POLICY IF EXISTS atlas_canonical_entities_tenant_isolation ON public.atlas_canonical_entities;

CREATE POLICY atlas_canonical_entities_tenant_isolation
ON public.atlas_canonical_entities
FOR ALL
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 2. ATLAS_ENTITY_SOURCE_OBSERVATIONS EXPLICIT RLS
-- ============================================================================

DROP POLICY IF EXISTS atlas_entity_source_obs_tenant_isolation ON public.atlas_entity_source_observations;

CREATE POLICY atlas_entity_source_obs_tenant_isolation
ON public.atlas_entity_source_observations
FOR ALL
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 3. ATLAS_ENTITY_ALIASES EXPLICIT RLS
-- ============================================================================

DROP POLICY IF EXISTS atlas_entity_aliases_tenant_isolation ON public.atlas_entity_aliases;

CREATE POLICY atlas_entity_aliases_tenant_isolation
ON public.atlas_entity_aliases
FOR ALL
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 4. ATLAS_ENTITY_MERGES EXPLICIT RLS
-- ============================================================================

DROP POLICY IF EXISTS atlas_entity_merges_tenant_isolation ON public.atlas_entity_merges;

CREATE POLICY atlas_entity_merges_tenant_isolation
ON public.atlas_entity_merges
FOR ALL
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());
