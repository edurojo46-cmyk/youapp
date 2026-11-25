/**
 * ATLAS TEMPORAL GRAPH V1
 * Module: AtlasTemporalRepository.ts
 * Path: src/lib/atlas/temporal/AtlasTemporalRepository.ts
 * 
 * Persistence & Indexing Repository for Temporal Observations and Temporal Events.
 * Dual-authority: In-Memory cache + Transactional PostgreSQL persistence.
 */

import { dbPool } from '../../../../server/db.ts';
import type { TemporalObservation, TemporalStatus } from './AtlasTemporalObservation.ts';
import type { TemporalEvent } from './AtlasTemporalEvent.ts';

export class AtlasTemporalRepository {
  private static instance: AtlasTemporalRepository;
  private pool: any;
  private isSchemaInit: boolean = false;

  // In-Memory Indexing
  private observationsById: Map<string, TemporalObservation> = new Map();
  private observationsByAssertionId: Map<string, TemporalObservation[]> = new Map();
  private eventsById: Map<string, TemporalEvent> = new Map();
  private eventsBySubjectId: Map<string, TemporalEvent[]> = new Map();

  private constructor(pool?: any) {
    this.pool = pool || dbPool;
  }

  public static getInstance(pool?: any): AtlasTemporalRepository {
    if (!AtlasTemporalRepository.instance) {
      AtlasTemporalRepository.instance = new AtlasTemporalRepository(pool);
    }
    return AtlasTemporalRepository.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isSchemaInit) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_temporal_observations (
          temporal_observation_id TEXT PRIMARY KEY,
          assertion_id TEXT NOT NULL REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE CASCADE,
          evidence_id TEXT NOT NULL REFERENCES public.atlas_truth_evidence(evidence_id) ON DELETE CASCADE,
          observed_at TIMESTAMPTZ NOT NULL,
          valid_from TIMESTAMPTZ,
          valid_to TIMESTAMPTZ,
          first_seen TIMESTAMPTZ NOT NULL,
          last_seen TIMESTAMPTZ NOT NULL,
          superseded_at TIMESTAMPTZ,
          status TEXT NOT NULL,
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(assertion_id, evidence_id)
        );

        CREATE TABLE IF NOT EXISTS public.atlas_temporal_events (
          event_id TEXT PRIMARY KEY,
          subject_type TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          temporal_semantics TEXT NOT NULL DEFAULT 'FIRST_OBSERVED',
          old_assertion_id TEXT REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE SET NULL,
          new_assertion_id TEXT NOT NULL REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE CASCADE,
          detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          event_nature TEXT NOT NULL,
          confidence NUMERIC NOT NULL DEFAULT 1.0,
          time_anchor TIMESTAMPTZ NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}',
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE public.atlas_temporal_events ADD COLUMN IF NOT EXISTS temporal_semantics TEXT NOT NULL DEFAULT 'FIRST_OBSERVED';
        CREATE INDEX IF NOT EXISTS idx_atlas_temporal_obs_assertion ON public.atlas_temporal_observations(assertion_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_temporal_obs_env ON public.atlas_temporal_observations(environment);
        CREATE INDEX IF NOT EXISTS idx_atlas_temporal_events_subject ON public.atlas_temporal_events(subject_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_temporal_events_type ON public.atlas_temporal_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_atlas_temporal_events_semantics ON public.atlas_temporal_events(temporal_semantics);
        CREATE INDEX IF NOT EXISTS idx_atlas_temporal_events_env ON public.atlas_temporal_events(environment);
      `);
      this.isSchemaInit = true;
    } catch (err: any) {
      console.warn('[AtlasTemporalRepository] initSchema notice:', err.message);
      this.isSchemaInit = true; // Memory cache continues to operate
    }
  }

  /**
   * Records a Temporal Observation idempotently.
   */
  public async recordObservation(
    obs: TemporalObservation
  ): Promise<{ observation: TemporalObservation; isNew: boolean }> {
    await this.initSchema();

    const existing = this.observationsById.get(obs.temporal_observation_id);
    if (existing) {
      // Update last seen
      existing.last_seen = obs.last_seen;
      return { observation: existing, isNew: false };
    }

    this.observationsById.set(obs.temporal_observation_id, obs);
    const list = this.observationsByAssertionId.get(obs.assertion_id) || [];
    list.push(obs);
    this.observationsByAssertionId.set(obs.assertion_id, list);

    try {
      await this.pool.query(`
        INSERT INTO public.atlas_temporal_observations (
          temporal_observation_id, assertion_id, evidence_id, observed_at,
          valid_from, valid_to, first_seen, last_seen, superseded_at,
          status, environment, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (assertion_id, evidence_id) DO UPDATE SET
          last_seen = EXCLUDED.last_seen;
      `, [
        obs.temporal_observation_id,
        obs.assertion_id,
        obs.evidence_id,
        obs.observed_at,
        obs.valid_from,
        obs.valid_to,
        obs.first_seen,
        obs.last_seen,
        obs.superseded_at || null,
        obs.status,
        obs.environment,
        obs.created_at
      ]);
    } catch (err: any) {
      console.warn('[AtlasTemporalRepository] observation insert notice:', err.message);
    }

    return { observation: obs, isNew: true };
  }

  /**
   * Records a Temporal Event idempotently.
   */
  public async recordEvent(
    event: TemporalEvent
  ): Promise<{ event: TemporalEvent; isNew: boolean }> {
    await this.initSchema();

    const existing = this.eventsById.get(event.event_id);
    if (existing) {
      return { event: existing, isNew: false };
    }

    this.eventsById.set(event.event_id, event);
    const list = this.eventsBySubjectId.get(event.subject_id) || [];
    list.push(event);
    this.eventsBySubjectId.set(event.subject_id, list);

    try {
      await this.pool.query(`
        INSERT INTO public.atlas_temporal_events (
          event_id, subject_type, subject_id, event_type, temporal_semantics, old_assertion_id,
          new_assertion_id, detected_at, event_nature, confidence, time_anchor,
          metadata, environment, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (event_id) DO NOTHING;
      `, [
        event.event_id,
        event.subject_type,
        event.subject_id,
        event.event_type,
        event.temporal_semantics || 'FIRST_OBSERVED',
        event.old_assertion_id || null,
        event.new_assertion_id,
        event.detected_at,
        event.event_nature,
        event.confidence,
        event.time_anchor,
        JSON.stringify(event.metadata || {}),
        event.environment,
        event.created_at
      ]);
    } catch (err: any) {
      console.warn('[AtlasTemporalRepository] event insert notice:', err.message);
    }

    return { event, isNew: true };
  }

  public async updateObservationStatus(
    observation_id: string,
    status: TemporalStatus,
    superseded_at?: string
  ): Promise<void> {
    const obs = this.observationsById.get(observation_id);
    if (obs) {
      obs.status = status;
      if (superseded_at) obs.superseded_at = superseded_at;
    }

    try {
      await this.pool.query(`
        UPDATE public.atlas_temporal_observations
        SET status = $1, superseded_at = $2
        WHERE temporal_observation_id = $3;
      `, [status, superseded_at || null, observation_id]);
    } catch (err: any) {
      console.warn('[AtlasTemporalRepository] updateObservationStatus notice:', err.message);
    }
  }

  public getObservationsForAssertion(
    assertion_id: string,
    environment?: 'PRODUCTION' | 'TEST'
  ): TemporalObservation[] {
    const list = this.observationsByAssertionId.get(assertion_id) || [];
    if (!environment) return list;
    return list.filter(o => o.environment === environment);
  }

  public async getObservationsForAssertionFromDb(
    assertion_id: string,
    environment: 'PRODUCTION' | 'TEST' = 'PRODUCTION'
  ): Promise<TemporalObservation[]> {
    try {
      const res = await this.pool.query(`
        SELECT temporal_observation_id, assertion_id, evidence_id, observed_at,
               valid_from, valid_to, status, superseded_at, environment, created_at
        FROM public.atlas_temporal_observations
        WHERE assertion_id = $1 AND environment = $2;
      `, [assertion_id, environment]);

      const list: TemporalObservation[] = res.rows.map((r: any) => ({
        temporal_observation_id: r.temporal_observation_id,
        assertion_id: r.assertion_id,
        evidence_id: r.evidence_id,
        observed_at: r.observed_at,
        valid_from: r.valid_from,
        valid_to: r.valid_to,
        status: r.status,
        superseded_at: r.superseded_at,
        environment: r.environment,
        created_at: r.created_at
      }));

      this.observationsByAssertionId.set(assertion_id, list);
      for (const o of list) {
        this.observationsById.set(o.temporal_observation_id, o);
      }
      return list;
    } catch (err: any) {
      console.warn('[AtlasTemporalRepository] getObservationsForAssertionFromDb notice:', err.message);
      return this.getObservationsForAssertion(assertion_id, environment);
    }
  }

  public getEventsForSubject(
    subject_id: string,
    environment?: 'PRODUCTION' | 'TEST'
  ): TemporalEvent[] {
    const list = this.eventsBySubjectId.get(subject_id) || [];
    if (!environment) return list;
    return list.filter(e => e.environment === environment);
  }

  public getAllObservations(environment?: 'PRODUCTION' | 'TEST'): TemporalObservation[] {
    const all = Array.from(this.observationsById.values());
    if (!environment) return all;
    return all.filter(o => o.environment === environment);
  }

  public getAllEvents(environment?: 'PRODUCTION' | 'TEST'): TemporalEvent[] {
    const all = Array.from(this.eventsById.values());
    if (!environment) return all;
    return all.filter(e => e.environment === environment);
  }

  /**
   * Direct PostgreSQL Readback Methods for Certification.
   */
  public async readbackObservationFromPostgres(temporal_observation_id: string): Promise<any> {
    const res = await this.pool.query(`
      SELECT temporal_observation_id, assertion_id, evidence_id, observed_at, valid_from, valid_to, status, environment
      FROM public.atlas_temporal_observations
      WHERE temporal_observation_id = $1;
    `, [temporal_observation_id]);
    return res.rows[0] || null;
  }

  public async readbackEventFromPostgres(event_id: string): Promise<any> {
    const res = await this.pool.query(`
      SELECT event_id, subject_id, event_type, temporal_semantics, old_assertion_id, new_assertion_id, event_nature, confidence, environment
      FROM public.atlas_temporal_events
      WHERE event_id = $1;
    `, [event_id]);
    return res.rows[0] || null;
  }

  public async readbackObservationsCount(environment?: 'PRODUCTION' | 'TEST'): Promise<number> {
    const query = environment
      ? 'SELECT count(*)::int as cnt FROM public.atlas_temporal_observations WHERE environment = $1;'
      : 'SELECT count(*)::int as cnt FROM public.atlas_temporal_observations;';
    const params = environment ? [environment] : [];
    const res = await this.pool.query(query, params);
    return res.rows[0]?.cnt || 0;
  }

  public async readbackEventsCount(environment?: 'PRODUCTION' | 'TEST'): Promise<number> {
    const query = environment
      ? 'SELECT count(*)::int as cnt FROM public.atlas_temporal_events WHERE environment = $1;'
      : 'SELECT count(*)::int as cnt FROM public.atlas_temporal_events;';
    const params = environment ? [environment] : [];
    const res = await this.pool.query(query, params);
    return res.rows[0]?.cnt || 0;
  }
}
