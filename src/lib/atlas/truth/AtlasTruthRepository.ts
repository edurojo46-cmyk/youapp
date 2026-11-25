/**
 * ATLAS TRUTH GRAPH V1
 * Module: AtlasTruthRepository.ts
 * Path: src/lib/atlas/truth/AtlasTruthRepository.ts
 * 
 * Persistence & Indexing Repository for Assertions, Evidences, and Conflicts.
 * Dual-authority: Fast In-Memory indexing with transactional PostgreSQL persistence.
 */

import { dbPool } from '../../../../server/db.ts';
import type { TruthAssertion } from './AtlasTruthAssertion.ts';
import type { TruthEvidence } from './AtlasTruthEvidence.ts';
import { AtlasTruthConflictResolver, type TruthConflictRecord } from './AtlasTruthConflictResolver.ts';

export class AtlasTruthRepository {
  private static instance: AtlasTruthRepository;
  private pool: any;
  private isSchemaInit: boolean = false;

  // In-memory indexing
  private assertionsById: Map<string, TruthAssertion> = new Map();
  private assertionsByLogicalKey: Map<string, TruthAssertion> = new Map(); // subject_id:predicate:value_hash
  private assertionsBySubject: Map<string, TruthAssertion[]> = new Map();
  private evidenceByAssertionId: Map<string, TruthEvidence[]> = new Map();
  private conflicts: Map<string, TruthConflictRecord> = new Map();

  private constructor(pool?: any) {
    this.pool = pool || dbPool;
  }

  public static getInstance(pool?: any): AtlasTruthRepository {
    if (!AtlasTruthRepository.instance) {
      AtlasTruthRepository.instance = new AtlasTruthRepository(pool);
    }
    return AtlasTruthRepository.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isSchemaInit) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_truth_assertions (
          assertion_id TEXT PRIMARY KEY,
          subject_type TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          predicate TEXT NOT NULL,
          value_normalized TEXT NOT NULL,
          value_hash TEXT NOT NULL,
          truth_nature TEXT NOT NULL DEFAULT 'OBSERVED',
          confidence NUMERIC NOT NULL DEFAULT 1.0,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          metadata JSONB NOT NULL DEFAULT '{}',
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          UNIQUE(subject_id, predicate, value_hash)
        );

        CREATE TABLE IF NOT EXISTS public.atlas_truth_evidence (
          evidence_id TEXT PRIMARY KEY,
          assertion_id TEXT NOT NULL REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE CASCADE,
          source_id TEXT NOT NULL,
          route_id TEXT,
          source_url TEXT,
          observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          method TEXT NOT NULL DEFAULT 'DIRECT_EXTRACT',
          evidence_fragment_hash TEXT NOT NULL,
          evidence_metadata JSONB NOT NULL DEFAULT '{}',
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS public.atlas_truth_conflicts (
          conflict_id TEXT PRIMARY KEY,
          subject_id TEXT NOT NULL,
          predicate TEXT NOT NULL,
          assertion_a_id TEXT NOT NULL REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE CASCADE,
          assertion_b_id TEXT NOT NULL REFERENCES public.atlas_truth_assertions(assertion_id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'CONFLICTING',
          detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolution_notes TEXT,
          environment TEXT NOT NULL DEFAULT 'PRODUCTION',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Ensure environment column exists on older schemas
        ALTER TABLE public.atlas_truth_assertions ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'PRODUCTION';
        ALTER TABLE public.atlas_truth_evidence ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'PRODUCTION';
        ALTER TABLE public.atlas_truth_conflicts ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'PRODUCTION';

        CREATE INDEX IF NOT EXISTS idx_atlas_truth_assertions_subject ON public.atlas_truth_assertions(subject_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_truth_assertions_predicate ON public.atlas_truth_assertions(predicate);
        CREATE INDEX IF NOT EXISTS idx_atlas_truth_assertions_env ON public.atlas_truth_assertions(environment, subject_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_truth_evidence_assertion ON public.atlas_truth_evidence(assertion_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_truth_evidence_source ON public.atlas_truth_evidence(source_id, route_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_truth_evidence_env ON public.atlas_truth_evidence(environment);
        CREATE INDEX IF NOT EXISTS idx_atlas_truth_conflicts_env ON public.atlas_truth_conflicts(environment);
      `);
      this.isSchemaInit = true;
    } catch (err: any) {
      console.warn('[AtlasTruthRepository] initSchema notice:', err.message);
      this.isSchemaInit = true; // In-memory authority preserved
    }
  }

  /**
   * Records an assertion idempotently.
   * If the assertion already exists for (subject_id, predicate, value_hash):
   * does NOT duplicate the assertion; attaches new evidence to the existing assertion.
   */
  public async recordAssertion(
    assertion: TruthAssertion,
    evidence?: TruthEvidence
  ): Promise<{ assertion: TruthAssertion; isNew: boolean; evidenceAdded: boolean; conflict?: TruthConflictRecord }> {
    await this.initSchema();

    const logicalKey = `${assertion.subject_id}:${assertion.predicate}:${assertion.value_hash}`;
    const existing = this.assertionsByLogicalKey.get(logicalKey);

    if (existing) {
      // Update last seen
      existing.last_seen = assertion.last_seen || new Date().toISOString();
      let evidenceAdded = false;

      if (evidence) {
        evidenceAdded = await this.addEvidence(evidence);
      }

      return {
        assertion: existing,
        isNew: false,
        evidenceAdded
      };
    }

    // New assertion: check for competing assertions on same subject + predicate
    const subjectList = this.assertionsBySubject.get(assertion.subject_id) || [];
    const conflictEval = AtlasTruthConflictResolver.evaluateConflict(assertion, subjectList);

    // Index in memory
    this.assertionsById.set(assertion.assertion_id, assertion);
    this.assertionsByLogicalKey.set(logicalKey, assertion);
    subjectList.push(assertion);
    this.assertionsBySubject.set(assertion.subject_id, subjectList);

    // Persist assertion to PostgreSQL
    try {
      await this.pool.query(`
        INSERT INTO public.atlas_truth_assertions (
          assertion_id, subject_type, subject_id, predicate, value_normalized,
          value_hash, truth_nature, confidence, status, first_seen, last_seen, created_at, metadata, environment
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (subject_id, predicate, value_hash) DO UPDATE SET
          last_seen = EXCLUDED.last_seen;
      `, [
        assertion.assertion_id,
        assertion.subject_type,
        assertion.subject_id,
        assertion.predicate,
        assertion.value_normalized,
        assertion.value_hash,
        assertion.truth_nature,
        assertion.confidence,
        assertion.status,
        assertion.first_seen,
        assertion.last_seen,
        assertion.created_at,
        JSON.stringify(assertion.metadata || {}),
        assertion.environment || 'PRODUCTION'
      ]);
    } catch (err: any) {
      console.warn('[AtlasTruthRepository] assertion insert notice:', err.message);
    }

    if (conflictEval.hasConflict && conflictEval.conflictRecord) {
      this.conflicts.set(conflictEval.conflictRecord.conflict_id, conflictEval.conflictRecord);
      try {
        await this.pool.query(`
          INSERT INTO public.atlas_truth_conflicts (
            conflict_id, subject_id, predicate, assertion_a_id, assertion_b_id, status, detected_at, resolution_notes, environment
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (conflict_id) DO NOTHING;
        `, [
          conflictEval.conflictRecord.conflict_id,
          conflictEval.conflictRecord.subject_id,
          conflictEval.conflictRecord.predicate,
          conflictEval.conflictRecord.assertion_a_id,
          conflictEval.conflictRecord.assertion_b_id,
          conflictEval.conflictRecord.status,
          conflictEval.conflictRecord.detected_at,
          conflictEval.conflictRecord.resolution_notes,
          conflictEval.conflictRecord.environment || assertion.environment || 'PRODUCTION'
        ]);
      } catch (err: any) {
        console.warn('[AtlasTruthRepository] conflict insert notice:', err.message);
      }
    }

    let evidenceAdded = false;
    if (evidence) {
      evidenceAdded = await this.addEvidence(evidence);
    }

    return {
      assertion,
      isNew: true,
      evidenceAdded,
      conflict: conflictEval.conflictRecord
    };
  }

  /**
   * Attaches evidence to an assertion.
   */
  public async addEvidence(evidence: TruthEvidence): Promise<boolean> {
    const list = this.evidenceByAssertionId.get(evidence.assertion_id) || [];
    // Avoid exact duplicate evidence on the same assertion
    const exists = list.some(e => e.evidence_id === evidence.evidence_id);
    if (!exists) {
      list.push(evidence);
      this.evidenceByAssertionId.set(evidence.assertion_id, list);

      try {
        await this.pool.query(`
          INSERT INTO public.atlas_truth_evidence (
            evidence_id, assertion_id, source_id, route_id, source_url, observed_at,
            method, evidence_fragment_hash, evidence_metadata, created_at, environment
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (evidence_id) DO NOTHING;
        `, [
          evidence.evidence_id,
          evidence.assertion_id,
          evidence.source_id,
          evidence.route_id || null,
          evidence.source_url || null,
          evidence.observed_at,
          evidence.method,
          evidence.evidence_fragment_hash,
          JSON.stringify(evidence.evidence_metadata || {}),
          evidence.created_at,
          evidence.environment || 'PRODUCTION'
        ]);
        return true;
      } catch (err: any) {
        console.warn('[AtlasTruthRepository] evidence insert notice:', err.message);
        return true;
      }
    }
    return false;
  }

  public getAssertionsBySubject(subject_id: string, environment?: 'PRODUCTION' | 'TEST'): TruthAssertion[] {
    const list = this.assertionsBySubject.get(subject_id) || [];
    if (!environment) return list;
    return list.filter(a => (a.environment || 'PRODUCTION') === environment);
  }

  public async getAssertionsBySubjectFromDb(
    subject_id: string,
    environment: 'PRODUCTION' | 'TEST' = 'PRODUCTION'
  ): Promise<TruthAssertion[]> {
    try {
      const res = await this.pool.query(`
        SELECT assertion_id, subject_type, subject_id, predicate, value_normalized, value_hash,
               truth_nature, confidence, status, first_seen, last_seen, created_at, metadata, environment
        FROM public.atlas_truth_assertions
        WHERE subject_id = $1 AND environment = $2;
      `, [subject_id, environment]);

      const list: TruthAssertion[] = res.rows.map((r: any) => ({
        assertion_id: r.assertion_id,
        subject_type: r.subject_type,
        subject_id: r.subject_id,
        predicate: r.predicate,
        value_normalized: r.value_normalized,
        value_hash: r.value_hash,
        truth_nature: r.truth_nature,
        confidence: parseFloat(r.confidence),
        status: r.status,
        first_seen: r.first_seen,
        last_seen: r.last_seen,
        created_at: r.created_at,
        metadata: r.metadata,
        environment: r.environment
      }));

      // Sync into memory cache
      this.assertionsBySubject.set(subject_id, list);
      for (const a of list) {
        this.assertionsById.set(a.assertion_id, a);
        this.assertionsByLogicalKey.set(`${a.subject_id}:${a.predicate}:${a.value_hash}`, a);
      }
      return list;
    } catch (err: any) {
      console.warn('[AtlasTruthRepository] getAssertionsBySubjectFromDb notice:', err.message);
      return this.getAssertionsBySubject(subject_id, environment);
    }
  }

  public getAssertionById(assertion_id: string): TruthAssertion | undefined {
    return this.assertionsById.get(assertion_id);
  }

  public getEvidenceForAssertion(assertion_id: string): TruthEvidence[] {
    return this.evidenceByAssertionId.get(assertion_id) || [];
  }

  public getAllAssertions(environment?: 'PRODUCTION' | 'TEST'): TruthAssertion[] {
    const all = Array.from(this.assertionsById.values());
    if (!environment) return all;
    return all.filter(a => (a.environment || 'PRODUCTION') === environment);
  }

  public getAllEvidence(environment?: 'PRODUCTION' | 'TEST'): TruthEvidence[] {
    const all: TruthEvidence[] = [];
    for (const list of this.evidenceByAssertionId.values()) {
      all.push(...list);
    }
    if (!environment) return all;
    return all.filter(e => (e.environment || 'PRODUCTION') === environment);
  }

  public getAllConflicts(environment?: 'PRODUCTION' | 'TEST'): TruthConflictRecord[] {
    const all = Array.from(this.conflicts.values());
    if (!environment) return all;
    return all.filter(c => (c.environment || 'PRODUCTION') === environment);
  }

  /**
   * Direct PostgreSQL Readback for Certification.
   */
  public async readbackAssertionFromPostgres(assertion_id: string): Promise<any> {
    const res = await this.pool.query(`
      SELECT assertion_id, subject_id, predicate, value_normalized, truth_nature, status
      FROM public.atlas_truth_assertions
      WHERE assertion_id = $1;
    `, [assertion_id]);
    return res.rows[0] || null;
  }

  public async readbackEvidenceCountFromPostgres(assertion_id: string): Promise<number> {
    const res = await this.pool.query(`
      SELECT COUNT(*)::int as cnt
      FROM public.atlas_truth_evidence
      WHERE assertion_id = $1;
    `, [assertion_id]);
    return res.rows[0]?.cnt || 0;
  }
}
