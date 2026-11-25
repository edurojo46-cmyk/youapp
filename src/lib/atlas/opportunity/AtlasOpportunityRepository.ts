/**
 * ATLAS OPPORTUNITY ENGINE V1
 * Module: AtlasOpportunityRepository.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunityRepository.ts
 * 
 * Persistence & Indexing Repository for Signals, Opportunities, and Opportunity Evidence.
 * Dual-authority: In-Memory cache + Transactional PostgreSQL persistence.
 */

import { dbPool } from '../../../../server/db.ts';
import type { OpportunitySignal } from './AtlasOpportunitySignal.ts';
import type { OpportunityHypothesis } from './AtlasOpportunityHypothesis.ts';
import type { OpportunityEvidenceLink } from './AtlasOpportunityEvidence.ts';

export class AtlasOpportunityRepository {
  private static instance: AtlasOpportunityRepository;
  private pool: any;
  private isSchemaInit: boolean = false;

  // In-Memory Indexing
  private signalsById: Map<string, OpportunitySignal> = new Map();
  private signalsBySubjectId: Map<string, OpportunitySignal[]> = new Map();
  private opportunitiesById: Map<string, OpportunityHypothesis> = new Map();
  private opportunitiesBySubjectId: Map<string, OpportunityHypothesis[]> = new Map();
  private opportunitiesByLogicalKey: Map<string, OpportunityHypothesis> = new Map(); // subject:type:version
  private evidenceLinksById: Map<string, OpportunityEvidenceLink> = new Map();
  private evidenceLinksByOpportunityId: Map<string, OpportunityEvidenceLink[]> = new Map();

  private constructor(pool?: any) {
    this.pool = pool || dbPool;
  }

  public static getInstance(pool?: any): AtlasOpportunityRepository {
    if (!AtlasOpportunityRepository.instance) {
      AtlasOpportunityRepository.instance = new AtlasOpportunityRepository(pool);
    }
    return AtlasOpportunityRepository.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isSchemaInit) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_opportunity_signals (
          signal_id TEXT PRIMARY KEY,
          subject_type TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          signal_type TEXT NOT NULL,
          temporal_semantics TEXT NOT NULL DEFAULT 'FIRST_OBSERVED',
          assertion_id TEXT NOT NULL REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE CASCADE,
          temporal_event_id TEXT REFERENCES public.atlas_temporal_events(event_id) ON DELETE SET NULL,
          source_id TEXT NOT NULL,
          route_id TEXT,
          detected_at TIMESTAMPTZ NOT NULL,
          time_anchor TIMESTAMPTZ NOT NULL,
          quality_score NUMERIC NOT NULL DEFAULT 1.0,
          payload JSONB NOT NULL DEFAULT '{}',
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE public.atlas_opportunity_signals ADD COLUMN IF NOT EXISTS temporal_semantics TEXT NOT NULL DEFAULT 'FIRST_OBSERVED';

        CREATE TABLE IF NOT EXISTS public.atlas_opportunities (
          opportunity_id TEXT PRIMARY KEY,
          subject_type TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          opportunity_type TEXT NOT NULL,
          score NUMERIC NOT NULL,
          confidence NUMERIC NOT NULL,
          reasoning_version TEXT NOT NULL DEFAULT 'v1.0',
          first_detected TIMESTAMPTZ NOT NULL,
          last_supported TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          nature TEXT NOT NULL DEFAULT 'INFERRED',
          supporting_signals JSONB NOT NULL DEFAULT '[]',
          supporting_assertions JSONB NOT NULL DEFAULT '[]',
          supporting_events JSONB NOT NULL DEFAULT '[]',
          why_explanation JSONB NOT NULL DEFAULT '{}',
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(subject_id, opportunity_type, reasoning_version)
        );

        CREATE TABLE IF NOT EXISTS public.atlas_opportunity_evidence (
          opportunity_evidence_id TEXT PRIMARY KEY,
          opportunity_id TEXT NOT NULL REFERENCES public.atlas_opportunities(opportunity_id) ON DELETE CASCADE,
          signal_id TEXT NOT NULL REFERENCES public.atlas_opportunity_signals(signal_id) ON DELETE CASCADE,
          assertion_id TEXT NOT NULL REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE CASCADE,
          temporal_event_id TEXT REFERENCES public.atlas_temporal_events(event_id) ON DELETE SET NULL,
          source_id TEXT NOT NULL,
          route_id TEXT,
          observed_at TIMESTAMPTZ NOT NULL,
          role_in_hypothesis TEXT NOT NULL,
          weight NUMERIC NOT NULL DEFAULT 1.0,
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(opportunity_id, signal_id, assertion_id)
        );

        CREATE INDEX IF NOT EXISTS idx_atlas_opp_signals_subject ON public.atlas_opportunity_signals(subject_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_signals_type ON public.atlas_opportunity_signals(signal_type);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_signals_env ON public.atlas_opportunity_signals(environment);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_subject ON public.atlas_opportunities(subject_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_type ON public.atlas_opportunities(opportunity_type);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_status ON public.atlas_opportunities(status);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_env ON public.atlas_opportunities(environment);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_evd_opp ON public.atlas_opportunity_evidence(opportunity_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_opp_evd_env ON public.atlas_opportunity_evidence(environment);
      `);
      this.isSchemaInit = true;
    } catch (err: any) {
      console.warn('[AtlasOpportunityRepository] initSchema notice:', err.message);
      this.isSchemaInit = true;
    }
  }

  /**
   * Records an Opportunity Signal idempotently.
   */
  public async saveSignal(
    signal: OpportunitySignal
  ): Promise<{ signal: OpportunitySignal; isNew: boolean }> {
    await this.initSchema();

    const existing = this.signalsById.get(signal.signal_id);
    if (existing) {
      return { signal: existing, isNew: false };
    }

    this.signalsById.set(signal.signal_id, signal);
    const list = this.signalsBySubjectId.get(signal.subject_id) || [];
    list.push(signal);
    this.signalsBySubjectId.set(signal.subject_id, list);

    try {
      await this.pool.query(`
        INSERT INTO public.atlas_opportunity_signals (
          signal_id, subject_type, subject_id, signal_type, temporal_semantics, assertion_id,
          temporal_event_id, source_id, route_id, detected_at, time_anchor,
          quality_score, payload, environment, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (signal_id) DO NOTHING;
      `, [
        signal.signal_id,
        signal.subject_type,
        signal.subject_id,
        signal.signal_type,
        signal.temporal_semantics || 'FIRST_OBSERVED',
        signal.assertion_id,
        signal.temporal_event_id || null,
        signal.source_id,
        signal.route_id || null,
        signal.detected_at,
        signal.time_anchor,
        signal.quality_score,
        JSON.stringify(signal.payload || {}),
        signal.environment,
        signal.created_at
      ]);
    } catch (err: any) {
      console.warn('[AtlasOpportunityRepository] signal insert notice:', err.message);
    }

    return { signal, isNew: true };
  }

  /**
   * Records or updates an Opportunity Hypothesis idempotently.
   * Deduplicates by logical key (subject_id + opportunity_type + reasoning_version).
   */
  public async saveOpportunity(
    opp: OpportunityHypothesis
  ): Promise<{ opportunity: OpportunityHypothesis; isNew: boolean }> {
    await this.initSchema();

    const logicalKey = `${opp.subject_id}:${opp.opportunity_type}:${opp.reasoning_version}`;
    const existing = this.opportunitiesByLogicalKey.get(logicalKey);

    if (existing) {
      // Update existing opportunity with new score, confidence, and timestamps
      existing.score = opp.score;
      existing.confidence = opp.confidence;
      existing.last_supported = opp.last_supported;
      existing.expires_at = opp.expires_at;
      existing.status = opp.status;
      existing.updated_at = new Date().toISOString();
      existing.supporting_signals = Array.from(new Set([...existing.supporting_signals, ...opp.supporting_signals]));
      existing.supporting_assertions = Array.from(new Set([...existing.supporting_assertions, ...opp.supporting_assertions]));
      existing.supporting_events = Array.from(new Set([...existing.supporting_events, ...opp.supporting_events]));
      existing.why_explanation = opp.why_explanation;

      try {
        await this.pool.query(`
          UPDATE public.atlas_opportunities
          SET score = $1, confidence = $2, last_supported = $3, expires_at = $4,
              status = $5, supporting_signals = $6, supporting_assertions = $7,
              supporting_events = $8, why_explanation = $9, updated_at = $10
          WHERE subject_id = $11 AND opportunity_type = $12 AND reasoning_version = $13;
        `, [
          existing.score,
          existing.confidence,
          existing.last_supported,
          existing.expires_at,
          existing.status,
          JSON.stringify(existing.supporting_signals),
          JSON.stringify(existing.supporting_assertions),
          JSON.stringify(existing.supporting_events),
          JSON.stringify(existing.why_explanation),
          existing.updated_at,
          existing.subject_id,
          existing.opportunity_type,
          existing.reasoning_version
        ]);
      } catch (err: any) {
        console.warn('[AtlasOpportunityRepository] opportunity update notice:', err.message);
      }

      return { opportunity: existing, isNew: false };
    }

    // New Opportunity
    this.opportunitiesById.set(opp.opportunity_id, opp);
    this.opportunitiesByLogicalKey.set(logicalKey, opp);
    const list = this.opportunitiesBySubjectId.get(opp.subject_id) || [];
    list.push(opp);
    this.opportunitiesBySubjectId.set(opp.subject_id, list);

    try {
      await this.pool.query(`
        INSERT INTO public.atlas_opportunities (
          opportunity_id, subject_type, subject_id, opportunity_type, score,
          confidence, reasoning_version, first_detected, last_supported,
          expires_at, status, nature, supporting_signals, supporting_assertions,
          supporting_events, why_explanation, environment, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (subject_id, opportunity_type, reasoning_version) DO UPDATE SET
          score = EXCLUDED.score,
          confidence = EXCLUDED.confidence,
          last_supported = EXCLUDED.last_supported,
          expires_at = EXCLUDED.expires_at,
          status = EXCLUDED.status,
          supporting_signals = EXCLUDED.supporting_signals,
          supporting_assertions = EXCLUDED.supporting_assertions,
          supporting_events = EXCLUDED.supporting_events,
          why_explanation = EXCLUDED.why_explanation,
          updated_at = NOW();
      `, [
        opp.opportunity_id,
        opp.subject_type,
        opp.subject_id,
        opp.opportunity_type,
        opp.score,
        opp.confidence,
        opp.reasoning_version,
        opp.first_detected,
        opp.last_supported,
        opp.expires_at,
        opp.status,
        opp.nature,
        JSON.stringify(opp.supporting_signals),
        JSON.stringify(opp.supporting_assertions),
        JSON.stringify(opp.supporting_events),
        JSON.stringify(opp.why_explanation),
        opp.environment,
        opp.created_at,
        opp.updated_at
      ]);
    } catch (err: any) {
      console.warn('[AtlasOpportunityRepository] opportunity insert notice:', err.message);
    }

    return { opportunity: opp, isNew: true };
  }

  /**
   * Records an Opportunity Evidence Link.
   */
  public async saveEvidenceLink(
    link: OpportunityEvidenceLink
  ): Promise<{ link: OpportunityEvidenceLink; isNew: boolean }> {
    await this.initSchema();

    const existing = this.evidenceLinksById.get(link.opportunity_evidence_id);
    if (existing) {
      return { link: existing, isNew: false };
    }

    this.evidenceLinksById.set(link.opportunity_evidence_id, link);
    const list = this.evidenceLinksByOpportunityId.get(link.opportunity_id) || [];
    list.push(link);
    this.evidenceLinksByOpportunityId.set(link.opportunity_id, list);

    try {
      await this.pool.query(`
        INSERT INTO public.atlas_opportunity_evidence (
          opportunity_evidence_id, opportunity_id, signal_id, assertion_id,
          temporal_event_id, source_id, route_id, observed_at, role_in_hypothesis,
          weight, environment, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (opportunity_id, signal_id, assertion_id) DO NOTHING;
      `, [
        link.opportunity_evidence_id,
        link.opportunity_id,
        link.signal_id,
        link.assertion_id,
        link.temporal_event_id || null,
        link.source_id,
        link.route_id || null,
        link.observed_at,
        link.role_in_hypothesis,
        link.weight,
        link.environment,
        link.created_at
      ]);
    } catch (err: any) {
      console.warn('[AtlasOpportunityRepository] evidence link insert notice:', err.message);
    }

    return { link, isNew: true };
  }

  public getSignalsForSubject(
    subject_id: string,
    environment?: 'PRODUCTION' | 'TEST'
  ): OpportunitySignal[] {
    const list = this.signalsBySubjectId.get(subject_id) || [];
    if (!environment) return list;
    return list.filter(s => s.environment === environment);
  }

  public getOpportunitiesForSubject(
    subject_id: string,
    environment?: 'PRODUCTION' | 'TEST'
  ): OpportunityHypothesis[] {
    const list = this.opportunitiesBySubjectId.get(subject_id) || [];
    if (!environment) return list;
    return list.filter(o => o.environment === environment);
  }

  public getAllSignals(environment?: 'PRODUCTION' | 'TEST'): OpportunitySignal[] {
    const all = Array.from(this.signalsById.values());
    if (!environment) return all;
    return all.filter(s => s.environment === environment);
  }

  public getAllOpportunities(environment?: 'PRODUCTION' | 'TEST'): OpportunityHypothesis[] {
    const all = Array.from(this.opportunitiesById.values());
    if (!environment) return all;
    return all.filter(o => o.environment === environment);
  }

  public getAllEvidenceLinks(environment?: 'PRODUCTION' | 'TEST'): OpportunityEvidenceLink[] {
    const all = Array.from(this.evidenceLinksById.values());
    if (!environment) return all;
    return all.filter(l => l.environment === environment);
  }

  public getEvidenceLinksForOpportunity(
    opportunity_id: string,
    environment?: 'PRODUCTION' | 'TEST'
  ): OpportunityEvidenceLink[] {
    const list = this.evidenceLinksByOpportunityId.get(opportunity_id) || [];
    if (!environment) return list;
    return list.filter(l => l.environment === environment);
  }

  /**
   * Direct PostgreSQL Readback Methods for Certification.
   */
  public async readbackOpportunityFromPostgres(opportunity_id: string): Promise<any> {
    const res = await this.pool.query(`
      SELECT opportunity_id, subject_id, opportunity_type, score, confidence,
             reasoning_version, status, nature, environment
      FROM public.atlas_opportunities
      WHERE opportunity_id = $1;
    `, [opportunity_id]);
    return res.rows[0] || null;
  }

  public async readbackSignalFromPostgres(signal_id: string): Promise<any> {
    const res = await this.pool.query(`
      SELECT signal_id, subject_id, signal_type, assertion_id, source_id, environment
      FROM public.atlas_opportunity_signals
      WHERE signal_id = $1;
    `, [signal_id]);
    return res.rows[0] || null;
  }

  public async readbackOpportunitiesCount(environment?: 'PRODUCTION' | 'TEST'): Promise<number> {
    const query = environment
      ? 'SELECT count(*)::int as cnt FROM public.atlas_opportunities WHERE environment = $1;'
      : 'SELECT count(*)::int as cnt FROM public.atlas_opportunities;';
    const params = environment ? [environment] : [];
    const res = await this.pool.query(query, params);
    return res.rows[0]?.cnt || 0;
  }

  public async readbackSignalsCount(environment?: 'PRODUCTION' | 'TEST'): Promise<number> {
    const query = environment
      ? 'SELECT count(*)::int as cnt FROM public.atlas_opportunity_signals WHERE environment = $1;'
      : 'SELECT count(*)::int as cnt FROM public.atlas_opportunity_signals;';
    const params = environment ? [environment] : [];
    const res = await this.pool.query(query, params);
    return res.rows[0]?.cnt || 0;
  }
}
