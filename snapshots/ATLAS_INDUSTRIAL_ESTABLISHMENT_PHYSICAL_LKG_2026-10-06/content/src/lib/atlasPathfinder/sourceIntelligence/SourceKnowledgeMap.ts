/**
 * ATLAS — SOURCE INTELLIGENCE LAYER
 * Module: SourceKnowledgeMap (Sections 1, 4, 5, 6)
 * 
 * Central Source Memory & Knowledge Map:
 * Bridges with the authoritative PostgreSQL SSOT (`public.atlas_source_knowledge_map`).
 * 
 * ARCHITECTURAL ROLE:
 *   REPOSITORY / ADAPTER / REBUILDABLE CACHE OVER THE POSTGRESQL SSOT.
 *   POSTGRESQL = AUTHORITATIVE SOURCE SSOT.
 *   CACHE != SSOT (Cache is strictly an ephemeral in-memory projection).
 * 
 * Bi-directional learning:
 *   READ SSOT -> PLAN -> EXECUTE -> MEASURE -> UPDATE SSOT
 */

import { dbPool } from '../../../../server/db.ts';
import type { SourceClass, EvidenceGoal } from '../types.ts';

export type SourceStatus =
  | 'ACTIVE'
  | 'CANARY'
  | 'PROMOTED'
  | 'DEPLETED'
  | 'SEMANTIC_MOTOR'
  | 'DORMANT'
  | 'EXHAUSTED';

export type SourceRole =
  | 'ENTITY_SOURCE'
  | 'TAXONOMY_SOURCE'
  | 'DISCOVERY_SOURCE'
  | 'EVIDENCE_SOURCE'
  | 'ENRICHMENT_SOURCE'
  | 'DIRECTORY_SOURCE'
  | 'GEO_SOURCE';

export type CanProduceEntityRows = 'TRUE' | 'FALSE' | 'UNKNOWN';

export interface SourceKnowledgeEntry {
  source_id: string;
  source_name: string;
  source_family: string;
  source_universe: string;
  canonical_url: string;
  parent_domain: string;
  access_method: 'DIRECT_PULL' | 'REST_API' | 'BULK_CSV' | 'OAI_PMH' | 'SPARQL' | 'HTML_SCRAPE';
  protocol: string;
  geography_scope: string;
  topics: string[];
  entity_types_observed: string[];
  relation_types_observed: string[];
  evidence_types_observed: string[];
  evidence_goals_solved: string[];
  source_class: SourceClass;
  volume_estimate: number;
  realized_yield: number;     // 0.0 - 1.0 (verified / scanned)
  qualified_yield: number;    // 0.0 - 1.0 (mission qualified / scanned)
  qualified_per_second: number;
  novelty: number;            // 0.0 - 1.0
  overlap: number;            // 0.0 - 1.0
  latency_ms: number;
  reliability_score: number;  // 0.0 - 1.0
  saturation: number;         // 0.0 - 1.0
  current_status: SourceStatus;
  last_tested: string | null;
  last_success: string | null;
  failure_modes: string[];
  related_endpoints?: string[];
  ecosystem_universe?: string[];

  // Truth Gate Section 1 & 2 explicit capability fields
  source_roles?: SourceRole[];
  can_produce_entity_rows?: CanProduceEntityRows;
  entity_types_supported?: string[];
  row_unit_supported?: string[];
  geographic_granularity?: string;
  queryability?: {
    by_concept?: boolean;
    by_geography?: boolean;
    by_id?: boolean;
    [key: string]: any;
  };
  public_access_confirmed?: boolean;
}

export interface SourceMissionFeedback {
  source_id: string;
  goal_id?: string;
  candidates_found: number;
  verified: number;
  qualified: number;
  latency_ms: number;
  evidence_coverage: number;
  novelty: number;
  overlap: number;
  failure_reason?: string;
}



export function mapRowToSourceEntry(row: any): SourceKnowledgeEntry {
  const overlapMem = row.overlap_memory || {};
  const fieldTelem = row.field_telemetry || {};
  const schemaSig = row.schema_signature || {};
  const entityCaps = row.entity_capabilities || {};
  const graphRels = row.source_graph_relations || [];

  const scanned = Number(overlapMem.records_scanned || 0);
  const netNew = Number(overlapMem.true_net_new_found || 0);
  const calcYield = scanned > 0 ? parseFloat((netNew / scanned).toFixed(2)) : 0.85;

  const overlapHistory = overlapMem.overlap_with_ssot_history || [];
  const lastOverlap = overlapHistory.length > 0 ? Number(overlapHistory[overlapHistory.length - 1]) : 0.20;

  const satCurve = overlapMem.saturation_curve || [];
  const lastSat = satCurve.length > 0 ? Number(satCurve[satCurve.length - 1]) : 0.15;

  let topics: string[] = [];
  if (Array.isArray(fieldTelem.topics) && fieldTelem.topics.length > 0) {
    topics = fieldTelem.topics;
  } else if (Array.isArray(schemaSig.topics) && schemaSig.topics.length > 0) {
    topics = schemaSig.topics;
  } else {
    topics = [
      row.source_family.toLowerCase(),
      ...Object.keys(entityCaps).map(k => k.toLowerCase()),
      ...row.source_name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4)
    ];
  }

  let sourceClass: SourceClass = 'OPEN_DATA';
  if (schemaSig.source_class) {
    sourceClass = schemaSig.source_class;
  } else if (row.protocol === 'OAI_PMH') {
    sourceClass = row.source_family.includes('UN') ? 'UNIVERSITY_REPOSITORY' : 'RESEARCH_REPOSITORY';
  } else if (row.protocol === 'SPARQL' || row.source_family === 'WIKIDATA') {
    sourceClass = 'KNOWLEDGE_GRAPH';
  } else if (row.source_family === 'BOLETIN_OFICIAL' || row.source_family.includes('REGISTR') || row.source_family === 'ANMAT') {
    sourceClass = 'OFFICIAL_REGISTRY';
  } else if (row.source_family === 'OPENALEX') {
    sourceClass = 'RESEARCH_REPOSITORY';
  } else if (row.source_family.includes('DATA') || row.source_family.includes('GOB')) {
    sourceClass = 'OPEN_DATA';
  }

  let parentDomain = 'gob.ar';
  try {
    if (row.canonical_url) {
      parentDomain = new URL(row.canonical_url).hostname.replace(/^www\./, '');
    }
  } catch {
    parentDomain = row.source_family.toLowerCase() + '.gov.ar';
  }

  return {
    source_id: row.source_id,
    source_name: row.source_name,
    source_family: row.source_family,
    source_universe: row.source_universe || `UNIVERSE_${row.source_family}`,
    canonical_url: row.canonical_url,
    parent_domain: parentDomain,
    access_method: row.access_method || 'DIRECT_PULL',
    protocol: row.protocol || 'REST_API',
    geography_scope: row.geography_scope || 'ARGENTINA',
    topics: Array.from(new Set(topics)),
    entity_types_observed: Object.keys(entityCaps),
    relation_types_observed: graphRels.map((r: any) => r.relation_type || 'RELATES_TO'),
    evidence_types_observed: schemaSig.evidence_types || ['OFFICIAL_RECORD', 'PROCESSED_METRIC'],
    evidence_goals_solved: fieldTelem.evidence_goals_solved || [],
    source_class: sourceClass,
    volume_estimate: Number(row.estimated_records || 50000),
    realized_yield: fieldTelem.realized_yield !== undefined ? Number(fieldTelem.realized_yield) : calcYield,
    qualified_yield: fieldTelem.qualified_yield !== undefined ? Number(fieldTelem.qualified_yield) : 0.80,
    qualified_per_second: fieldTelem.qualified_per_second !== undefined ? Number(fieldTelem.qualified_per_second) : 10.0,
    novelty: fieldTelem.novelty !== undefined ? Number(fieldTelem.novelty) : parseFloat((1.0 - lastOverlap).toFixed(2)),
    overlap: lastOverlap,
    latency_ms: fieldTelem.latency_ms || 120,
    reliability_score: Number(row.reliability_score || 0.95),
    saturation: lastSat,
    current_status: (row.current_status || 'ACTIVE') as SourceStatus,
    last_tested: row.last_profiled_at ? new Date(row.last_profiled_at).toISOString() : null,
    last_success: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    failure_modes: fieldTelem.failure_modes || [],
    related_endpoints: fieldTelem.related_endpoints || [],
    ecosystem_universe: [row.source_universe || `UNIVERSE_${row.source_family}`],

    // Truth Gate Section 1 & 2 explicit capability fields
    source_roles: (row.source_roles || []) as SourceRole[],
    can_produce_entity_rows: (row.can_produce_entity_rows || 'UNKNOWN') as CanProduceEntityRows,
    entity_types_supported: row.entity_types_supported || [],
    row_unit_supported: row.row_unit_supported || [],
    geographic_granularity: row.geographic_granularity || 'UNKNOWN',
    queryability: row.queryability || {},
    public_access_confirmed: Boolean(row.public_access_confirmed)
  };
}

export class SourceKnowledgeMap {
  private static instance: SourceKnowledgeMap;
  private static sharedPool: any = null;

  public static readonly CANONICAL_ALIASES: Record<string, string> = {
    'SRC_BOLETIN_OFICIAL_NACION': 'SRC_PUB_BOLETIN_OFICIAL',
    'SRC_SEDICI_UNLP_ACADEMIA': 'SRC_OAI_SEDICI_UNLP'
  };

  private sources: Map<string, SourceKnowledgeEntry> = new Map();
  private ssotLoaded: boolean = false;
  private pendingOperations: Promise<any>[] = [];

  private constructor() {
    this.seedFoundationalSources();
  }

  public static getInstance(): SourceKnowledgeMap {
    if (!this.instance) {
      this.instance = new SourceKnowledgeMap();
    }
    return this.instance;
  }

  public static async getSSOTInstance(): Promise<SourceKnowledgeMap> {
    const inst = SourceKnowledgeMap.getInstance();
    if (!inst.ssotLoaded) {
      await inst.loadFromSSOT();
    }
    return inst;
  }

  public static resetForTest(): void {
    if (this.instance) {
      this.instance.sources.clear();
      this.instance.ssotLoaded = false;
    }
    this.instance = new SourceKnowledgeMap();
  }

  public static async closeSharedPool(): Promise<void> {
    if (this.sharedPool) {
      try {
        await this.sharedPool.end();
      } catch {
        // ignore
      }
      this.sharedPool = null;
    }
  }

  private getDbPool(): any {
    return dbPool;
  }

  public isSSOTConnected(): boolean {
    return this.ssotLoaded;
  }

  /**
   * Loads all authoritative sources directly from PostgreSQL SSOT (`public.atlas_source_knowledge_map`).
   * Replaces local in-memory projection with the authoritative DB rows.
   */
  public async loadFromSSOT(forceRefresh = false): Promise<SourceKnowledgeEntry[]> {
    if (this.ssotLoaded && !forceRefresh) {
      return this.getAllSources();
    }

    const pool = this.getDbPool();
    if (!pool) {
      console.warn('[SourceKnowledgeMap] DATABASE_URL unavailable. Operating in local seed fallback.');
      return this.getAllSources();
    }

    try {
      const res = await pool.query(`
        SELECT * FROM public.atlas_source_knowledge_map
        ORDER BY reliability_score DESC, estimated_records DESC;
      `);

      this.sources.clear();
      for (const row of res.rows) {
        const entry = mapRowToSourceEntry(row);
        this.sources.set(entry.source_id, entry);
      }
      this.ssotLoaded = true;
      return Array.from(this.sources.values());
    } catch (err: any) {
      console.warn('[SourceKnowledgeMap] PostgreSQL query failed, retaining fallback:', err.message);
      if (this.sources.size === 0) {
        this.seedFoundationalSources();
      }
      return this.getAllSources();
    }
  }

  /**
   * Rebuilds the in-memory cache completely from PostgreSQL SSOT.
   */
  public async rebuildCacheFromSSOT(): Promise<void> {
    this.sources.clear();
    this.ssotLoaded = false;
    await this.loadFromSSOT(true);
  }

  public getAllSources(): SourceKnowledgeEntry[] {
    return Array.from(this.sources.values());
  }

  public getSource(sourceId: string): SourceKnowledgeEntry | undefined {
    const canonicalId = SourceKnowledgeMap.CANONICAL_ALIASES[sourceId] || sourceId;
    return this.sources.get(canonicalId);
  }

  /**
   * Registers a source into local cache and performs write-through persistence to PostgreSQL SSOT.
   */
  public registerSource(entry: SourceKnowledgeEntry): SourceKnowledgeEntry {
    const canonicalId = SourceKnowledgeMap.CANONICAL_ALIASES[entry.source_id] || entry.source_id;
    const normalizedEntry = { ...entry, source_id: canonicalId };
    this.sources.set(canonicalId, normalizedEntry);

    const writePromise = this.writeEntryToSSOT(normalizedEntry).catch(err => {
      console.warn(`[SourceKnowledgeMap] SSOT write failed for ${canonicalId}:`, err.message);
    });
    this.pendingOperations.push(writePromise);

    return this.sources.get(canonicalId)!;
  }

  public async registerSourceAsync(entry: SourceKnowledgeEntry): Promise<SourceKnowledgeEntry> {
    const canonicalId = SourceKnowledgeMap.CANONICAL_ALIASES[entry.source_id] || entry.source_id;
    const normalizedEntry = { ...entry, source_id: canonicalId };
    this.sources.set(canonicalId, normalizedEntry);
    await this.writeEntryToSSOT(normalizedEntry);
    return this.sources.get(canonicalId)!;
  }

  public updateSourceMetrics(sourceId: string, update: Partial<SourceKnowledgeEntry>): void {
    const canonicalId = SourceKnowledgeMap.CANONICAL_ALIASES[sourceId] || sourceId;
    const existing = this.sources.get(canonicalId);
    if (!existing) return;

    const updated: SourceKnowledgeEntry = {
      ...existing,
      ...update,
      failure_modes: update.failure_modes
        ? Array.from(new Set([...existing.failure_modes, ...update.failure_modes]))
        : existing.failure_modes,
      evidence_goals_solved: update.evidence_goals_solved
        ? Array.from(new Set([...existing.evidence_goals_solved, ...update.evidence_goals_solved]))
        : existing.evidence_goals_solved
    };
    this.sources.set(canonicalId, updated);

    const writePromise = this.writeUpdateMetricsToSSOT(canonicalId, update).catch(err => {
      console.warn(`[SourceKnowledgeMap] SSOT metric update failed for ${canonicalId}:`, err.message);
    });
    this.pendingOperations.push(writePromise);
  }

  public async updateSourceMetricsAsync(sourceId: string, update: Partial<SourceKnowledgeEntry>): Promise<void> {
    this.updateSourceMetrics(sourceId, update);
    await this.syncToSSOT();
  }

  /**
   * Find candidate sources in the knowledge map matching an EvidenceGoal across all SSOT sources.
   */
  public findSourcesForGoal(goal: EvidenceGoal, geography: string = 'Argentina'): SourceKnowledgeEntry[] {
    const geoNorm = geography.toUpperCase();
    const statementNorm = goal.statement_to_prove.toLowerCase();
    const statementTokens = statementNorm.split(/\s+/).filter(w => w.length > 3);

    const candidates = Array.from(this.sources.values()).filter(src => {
      // 1. Geography match (National or specific match)
      const geoMatches = src.geography_scope === 'ARGENTINA' ||
        src.geography_scope === 'NACIONAL' ||
        geoNorm.includes(src.geography_scope) ||
        src.geography_scope.includes(geoNorm);

      if (!geoMatches) return false;

      // 2. Direct evidence goal resolution match (previously solved)
      if (src.evidence_goals_solved.includes(goal.id) || src.evidence_goals_solved.includes(goal.statement_to_prove)) {
        return true;
      }

      // 3. Preferred source class match
      const classMatches = goal.preferred_source_classes.includes(src.source_class);

      // 4. Topic / keyword match
      const topicMatches = src.topics.some(t =>
        statementNorm.includes(t.toLowerCase()) ||
        statementTokens.some(tok => t.toLowerCase().includes(tok))
      );

      // 5. Entity capability match
      const entityMatches = src.entity_types_observed.some(e =>
        goal.subject_role && (e.toUpperCase().includes(goal.subject_role.toUpperCase()) || goal.subject_role.toUpperCase().includes(e.toUpperCase()))
      );

      // 6. Family name or source name match with goal keywords
      const familyMatches = statementTokens.some(tok =>
        src.source_family.toLowerCase().includes(tok) ||
        src.source_name.toLowerCase().includes(tok)
      );

      return classMatches || topicMatches || entityMatches || familyMatches;
    });

    // Sort: 1) Solved exact evidence goal first, 2) Matches preferred source class, 3) qualified yield descending, 4) latency ascending
    return candidates.sort((a, b) => {
      const aSolved = a.evidence_goals_solved.includes(goal.id) || a.evidence_goals_solved.includes(goal.statement_to_prove);
      const bSolved = b.evidence_goals_solved.includes(goal.id) || b.evidence_goals_solved.includes(goal.statement_to_prove);
      if (aSolved && !bSolved) return -1;
      if (!aSolved && bSolved) return 1;

      const aClass = goal.preferred_source_classes.includes(a.source_class);
      const bClass = goal.preferred_source_classes.includes(b.source_class);
      if (aClass && !bClass) return -1;
      if (!aClass && bClass) return 1;

      if (b.qualified_yield !== a.qualified_yield) {
        return b.qualified_yield - a.qualified_yield;
      }
      return a.latency_ms - b.latency_ms;
    });
  }

  /**
   * 6. BI-DIRECTIONAL LEARNING:
   * Records mission results back into the permanent Source Knowledge Map and PostgreSQL SSOT.
   */
  public recordMissionObservation(feedback: SourceMissionFeedback): void {
    const canonicalId = SourceKnowledgeMap.CANONICAL_ALIASES[feedback.source_id] || feedback.source_id;
    const src = this.sources.get(canonicalId);
    if (!src) return;

    const latencySec = Math.max(0.001, feedback.latency_ms / 1000);
    const qualifiedPerSec = feedback.qualified / latencySec;

    const totalScanned = feedback.candidates_found;
    const newQualifiedYield = totalScanned > 0
      ? parseFloat((feedback.qualified / totalScanned).toFixed(2))
      : 0;

    const updatedGoals = [...src.evidence_goals_solved];
    if (feedback.qualified > 0 && feedback.goal_id && !updatedGoals.includes(feedback.goal_id)) {
      updatedGoals.push(feedback.goal_id);
    }

    const failureModes = [...src.failure_modes];
    if (feedback.failure_reason && !failureModes.includes(feedback.failure_reason)) {
      failureModes.push(feedback.failure_reason);
    }

    let newStatus = src.current_status;
    if (feedback.qualified >= 3 || newQualifiedYield >= 0.6) {
      newStatus = 'PROMOTED';
    } else if (feedback.qualified === 0 && feedback.verified === 0) {
      newStatus = 'DORMANT';
    }

    const updatedEntry: SourceKnowledgeEntry = {
      ...src,
      realized_yield: totalScanned > 0 ? parseFloat((feedback.verified / totalScanned).toFixed(2)) : src.realized_yield,
      qualified_yield: newQualifiedYield > 0 ? newQualifiedYield : src.qualified_yield,
      qualified_per_second: parseFloat(qualifiedPerSec.toFixed(2)),
      latency_ms: feedback.latency_ms,
      novelty: feedback.novelty,
      overlap: feedback.overlap,
      evidence_goals_solved: updatedGoals,
      failure_modes: failureModes,
      current_status: newStatus,
      last_tested: new Date().toISOString(),
      last_success: feedback.qualified > 0 ? new Date().toISOString() : src.last_success
    };

    this.sources.set(canonicalId, updatedEntry);

    const writePromise = this.writeFeedbackToSSOT(feedback).catch(err => {
      console.warn(`[SourceKnowledgeMap] SSOT feedback write failed for ${canonicalId}:`, err.message);
    });
    this.pendingOperations.push(writePromise);
  }

  public async recordMissionObservationAsync(feedback: SourceMissionFeedback): Promise<void> {
    this.recordMissionObservation(feedback);
    await this.syncToSSOT();
  }

  /**
   * Flushes all pending write-through queries to PostgreSQL SSOT.
   */
  public async syncToSSOT(): Promise<void> {
    if (this.pendingOperations.length > 0) {
      const ops = [...this.pendingOperations];
      this.pendingOperations = [];
      await Promise.allSettled(ops);
    }
  }

  private async writeEntryToSSOT(entry: SourceKnowledgeEntry): Promise<void> {
    const pool = this.getDbPool();
    if (!pool) return;

    const query = `
      INSERT INTO public.atlas_source_knowledge_map (
        source_id,
        canonical_url,
        source_name,
        source_family,
        source_universe,
        geography_scope,
        protocol,
        access_method,
        supported_motor_template,
        current_status,
        estimated_records,
        reliability_score,
        quality_score,
        entity_capabilities,
        source_graph_relations,
        overlap_memory,
        field_telemetry,
        tesla_motor_capabilities,
        source_roles,
        can_produce_entity_rows,
        entity_types_supported,
        row_unit_supported,
        geographic_granularity,
        queryability,
        public_access_confirmed,
        last_profiled_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now(), now()
      )
      ON CONFLICT (source_id) DO UPDATE SET
        source_name = EXCLUDED.source_name,
        canonical_url = EXCLUDED.canonical_url,
        current_status = EXCLUDED.current_status,
        reliability_score = EXCLUDED.reliability_score,
        quality_score = EXCLUDED.quality_score,
        entity_capabilities = EXCLUDED.entity_capabilities,
        overlap_memory = EXCLUDED.overlap_memory,
        field_telemetry = EXCLUDED.field_telemetry,
        source_roles = EXCLUDED.source_roles,
        can_produce_entity_rows = EXCLUDED.can_produce_entity_rows,
        entity_types_supported = EXCLUDED.entity_types_supported,
        row_unit_supported = EXCLUDED.row_unit_supported,
        geographic_granularity = EXCLUDED.geographic_granularity,
        queryability = EXCLUDED.queryability,
        public_access_confirmed = EXCLUDED.public_access_confirmed,
        last_profiled_at = now(),
        updated_at = now();
    `;

    const motorTemplate = entry.protocol === 'OAI_PMH' ? 'OAI_PMH_MOTOR' :
      entry.protocol === 'SPARQL' ? 'SPARQL_MOTOR' :
      entry.protocol === 'CKAN' ? 'CKAN_MOTOR' :
      entry.protocol === 'CSV_STREAM' ? 'CSV_BULK_MOTOR' :
      entry.protocol === 'JSON_FEED' ? 'JSON_BULK_MOTOR' : 'REST_API_MOTOR';

    const entityCaps: Record<string, string> = {};
    for (const t of entry.entity_types_observed) {
      entityCaps[t] = 'HIGH';
    }

    const overlapMemory = {
      records_scanned: 1000,
      true_net_new_found: Math.round(1000 * (entry.realized_yield || 0.8)),
      overlap_with_ssot_history: [entry.overlap || 0.2],
      saturation_curve: [entry.saturation || 0.15]
    };

    const fieldTelemetry = {
      qualified_yield: entry.qualified_yield,
      qualified_per_second: entry.qualified_per_second,
      latency_ms: entry.latency_ms,
      topics: entry.topics,
      evidence_goals_solved: entry.evidence_goals_solved,
      failure_modes: entry.failure_modes,
      related_endpoints: entry.related_endpoints || []
    };

    await pool.query(query, [
      entry.source_id,
      entry.canonical_url,
      entry.source_name,
      entry.source_family,
      entry.source_universe,
      entry.geography_scope,
      entry.protocol,
      entry.access_method,
      motorTemplate,
      entry.current_status,
      entry.volume_estimate || 50000,
      entry.reliability_score || 0.95,
      0.90,
      JSON.stringify(entityCaps),
      JSON.stringify([]),
      JSON.stringify(overlapMemory),
      JSON.stringify(fieldTelemetry),
      ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SET_BASED_IDENTITY'],
      entry.source_roles || [],
      entry.can_produce_entity_rows || 'UNKNOWN',
      entry.entity_types_supported || [],
      entry.row_unit_supported || [],
      entry.geographic_granularity || 'UNKNOWN',
      JSON.stringify(entry.queryability || {}),
      Boolean(entry.public_access_confirmed)
    ]);
  }

  private async writeFeedbackToSSOT(feedback: SourceMissionFeedback): Promise<void> {
    const pool = this.getDbPool();
    if (!pool) return;

    const canonicalId = SourceKnowledgeMap.CANONICAL_ALIASES[feedback.source_id] || feedback.source_id;
    const existing = this.sources.get(canonicalId);
    if (!existing) return;

    const query = `
      UPDATE public.atlas_source_knowledge_map
      SET
        current_status = $1,
        overlap_memory = jsonb_set(
          jsonb_set(
            coalesce(overlap_memory, '{}'::jsonb),
            '{records_scanned}',
            to_jsonb(coalesce((overlap_memory->>'records_scanned')::bigint, 0) + $2::bigint)
          ),
          '{true_net_new_found}',
          to_jsonb(coalesce((overlap_memory->>'true_net_new_found')::bigint, 0) + $3::bigint)
        ),
        field_telemetry = jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(field_telemetry, '{}'::jsonb),
              '{qualified_yield}',
              to_jsonb($4::numeric)
            ),
            '{qualified_per_second}',
            to_jsonb($5::numeric)
          ),
          '{evidence_goals_solved}',
          $6::jsonb
        ),
        last_profiled_at = now(),
        last_seen_at = CASE WHEN $7::int > 0 THEN now() ELSE last_seen_at END,
        updated_at = now()
      WHERE source_id = $8;
    `;

    await pool.query(query, [
      existing.current_status,
      feedback.candidates_found,
      feedback.verified,
      existing.qualified_yield,
      existing.qualified_per_second,
      JSON.stringify(existing.evidence_goals_solved),
      feedback.qualified,
      canonicalId
    ]);
  }

  private async writeUpdateMetricsToSSOT(sourceId: string, update: Partial<SourceKnowledgeEntry>): Promise<void> {
    const pool = this.getDbPool();
    if (!pool) return;

    const canonicalId = SourceKnowledgeMap.CANONICAL_ALIASES[sourceId] || sourceId;
    const existing = this.sources.get(canonicalId);
    if (!existing) return;

    const query = `
      UPDATE public.atlas_source_knowledge_map
      SET
        current_status = coalesce($1, current_status),
        field_telemetry = jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(field_telemetry, '{}'::jsonb),
              '{failure_modes}',
              $2::jsonb
            ),
            '{evidence_goals_solved}',
            $3::jsonb
          ),
          '{qualified_yield}',
          to_jsonb($4::numeric)
        ),
        last_profiled_at = now(),
        updated_at = now()
      WHERE source_id = $5;
    `;

    await pool.query(query, [
      update.current_status || null,
      JSON.stringify(existing.failure_modes),
      JSON.stringify(existing.evidence_goals_solved),
      existing.qualified_yield,
      canonicalId
    ]);
  }

  /**
   * Seeds foundational sources for offline/test environments where PostgreSQL SSOT is not reachable.
   */
  private seedFoundationalSources(): void {
    const foundational: SourceKnowledgeEntry[] = [
      {
        source_id: 'SRC_OAI_CONICET_DIGITAL',
        source_name: 'CONICET Digital Repositorio Institucional',
        source_family: 'CONICET',
        source_universe: 'ACADEMIA_CONICET_RI',
        canonical_url: 'https://ri.conicet.gov.ar/oai/request',
        parent_domain: 'conicet.gov.ar',
        access_method: 'OAI_PMH',
        protocol: 'OAI_PMH',
        geography_scope: 'ARGENTINA',
        topics: ['investigacion', 'ciencia', 'tecnologia', 'patentes', 'papers', 'doctorados'],
        entity_types_observed: ['INSTITUTION', 'PERSON', 'TECHNOLOGY'],
        relation_types_observed: ['DEVELOPED_AT', 'AUTHORED_BY'],
        evidence_types_observed: ['SCIENTIFIC_REPORT', 'OAI_RECORD'],
        evidence_goals_solved: ['scientific_development_evidence'],
        source_class: 'RESEARCH_REPOSITORY',
        volume_estimate: 145000,
        realized_yield: 0.85,
        qualified_yield: 0.80,
        qualified_per_second: 12.5,
        novelty: 0.75,
        overlap: 0.25,
        latency_ms: 120,
        reliability_score: 0.98,
        saturation: 0.20,
        current_status: 'PROMOTED',
        last_tested: '2026-03-20T10:00:00Z',
        last_success: '2026-03-20T10:00:00Z',
        failure_modes: []
      },
      {
        source_id: 'SRC_PUB_DATOS_GOB_AR_OSC',
        source_name: 'Registro Nacional de Organizaciones de la Sociedad Civil (INAES/Datos.gob.ar)',
        source_family: 'DATOS_GOB_AR',
        source_universe: 'OPEN_GOVERNMENT_NATIONAL',
        canonical_url: 'https://datos.gob.ar/dataset/inaes-registro-organizaciones-sociedad-civil',
        parent_domain: 'datos.gob.ar',
        access_method: 'DIRECT_PULL',
        protocol: 'CSV_STREAM',
        geography_scope: 'ARGENTINA',
        topics: ['gobierno', 'produccion', 'mineria', 'energia', 'obras', 'estadisticas', 'transporte', 'organizaciones'],
        entity_types_observed: ['DATASET', 'ORGANIZATION', 'LOCALITY'],
        relation_types_observed: ['PUBLISHED_BY', 'HOSTS_INDUSTRIAL_ACTIVITY'],
        evidence_types_observed: ['OPEN_DATASET', 'OFFICIAL_METRICS'],
        evidence_goals_solved: ['public_industrial_evidence', 'verified_geographic_identity'],
        source_class: 'OPEN_DATA',
        volume_estimate: 500000,
        realized_yield: 0.90,
        qualified_yield: 0.85,
        qualified_per_second: 15.0,
        novelty: 0.88,
        overlap: 0.15,
        latency_ms: 95,
        reliability_score: 0.96,
        saturation: 0.18,
        current_status: 'PROMOTED',
        last_tested: '2026-03-22T14:30:00Z',
        last_success: '2026-03-22T14:30:00Z',
        failure_modes: []
      },
      {
        source_id: 'SRC_PUB_BOLETIN_OFICIAL',
        source_name: 'Boletín Oficial de la República Argentina — Segunda Sección (Sociedades)',
        source_family: 'BOLETIN_OFICIAL',
        source_universe: 'LEGAL_REGULATORY_NATIONAL',
        canonical_url: 'https://www.boletinoficial.gob.ar/seccion/segunda',
        parent_domain: 'boletinoficial.gob.ar',
        access_method: 'DIRECT_PULL',
        protocol: 'REST_API',
        geography_scope: 'ARGENTINA',
        topics: ['decretos', 'resoluciones', 'licitaciones', 'sociedades', 'consorcios', 'contratos'],
        entity_types_observed: ['ORGANIZATION', 'COMPANY', 'RELATIONSHIP', 'PROJECT'],
        relation_types_observed: ['COLLABORATES_WITH', 'SAME_CONTEXT_RELATION_REQUIRED'],
        evidence_types_observed: ['LEGAL_GAZETTE', 'DECREE_RECORD'],
        evidence_goals_solved: ['joint_collaboration_proof', 'authoritative_citation'],
        source_class: 'OFFICIAL_REGISTRY',
        volume_estimate: 800000,
        realized_yield: 0.95,
        qualified_yield: 0.88,
        qualified_per_second: 14.0,
        novelty: 0.92,
        overlap: 0.10,
        latency_ms: 110,
        reliability_score: 0.99,
        saturation: 0.15,
        current_status: 'PROMOTED',
        last_tested: '2026-03-23T09:00:00Z',
        last_success: '2026-03-23T09:00:00Z',
        failure_modes: []
      },
      {
        source_id: 'SRC_IGJ_SOCIEDADES_ACCIONES',
        source_name: 'Inspección General de Justicia - Registro de Sociedades',
        source_family: 'IGJ_CORPORATE_REGISTRIES',
        source_universe: 'CORPORATE_REGISTRIES_CABA_NACIONAL',
        canonical_url: 'https://argentina.gob.ar/justicia/igj',
        parent_domain: 'argentina.gob.ar',
        access_method: 'DIRECT_PULL',
        protocol: 'REST_API',
        geography_scope: 'ARGENTINA',
        topics: ['empresas', 'sociedades', 'autoridades', 'cuit', 'directorio', 'capital'],
        entity_types_observed: ['ORGANIZATION', 'COMPANY'],
        relation_types_observed: ['GOVERNED_BY'],
        evidence_types_observed: ['CORPORATE_RECORD', 'CUIT_CERTIFICATION'],
        evidence_goals_solved: ['commercial_entity_registry'],
        source_class: 'OFFICIAL_REGISTRY',
        volume_estimate: 350000,
        realized_yield: 0.92,
        qualified_yield: 0.86,
        qualified_per_second: 11.0,
        novelty: 0.80,
        overlap: 0.20,
        latency_ms: 140,
        reliability_score: 0.97,
        saturation: 0.22,
        current_status: 'PROMOTED',
        last_tested: '2026-03-21T16:00:00Z',
        last_success: '2026-03-21T16:00:00Z',
        failure_modes: []
      },
      {
        source_id: 'SRC_OAI_SEDICI_UNLP',
        source_name: 'SEDICI - Repositorio de la Universidad Nacional de La Plata',
        source_family: 'UNLP',
        source_universe: 'ACADEMIA_UNLP_SEDICI',
        canonical_url: 'http://sedici.unlp.edu.ar/oai/request',
        parent_domain: 'unlp.edu.ar',
        access_method: 'OAI_PMH',
        protocol: 'OAI_PMH',
        geography_scope: 'PBA',
        topics: ['tesis', 'ingenieria', 'tecnologia', 'baterias_litio', 'informatica', 'robotica'],
        entity_types_observed: ['INSTITUTION', 'TECHNOLOGY', 'PERSON'],
        relation_types_observed: ['DEVELOPED_AT'],
        evidence_types_observed: ['ACADEMIC_THESIS', 'ENGINEERING_REPORT'],
        evidence_goals_solved: ['educational_offer_evidence', 'scientific_development_evidence'],
        source_class: 'UNIVERSITY_REPOSITORY',
        volume_estimate: 95000,
        realized_yield: 0.88,
        qualified_yield: 0.82,
        qualified_per_second: 10.5,
        novelty: 0.82,
        overlap: 0.22,
        latency_ms: 130,
        reliability_score: 0.95,
        saturation: 0.25,
        current_status: 'PROMOTED',
        last_tested: '2026-03-19T11:20:00Z',
        last_success: '2026-03-19T11:20:00Z',
        failure_modes: []
      },
      {
        source_id: 'SRC_ANMAT_TECNOLOGIAS_MEDICAS',
        source_name: 'ANMAT - Registro Nacional de Tecnologías Médicas',
        source_family: 'ANMAT',
        source_universe: 'HEALTH_REGULATORY_NATIONAL',
        canonical_url: 'https://datos.gob.ar/dataset/salud-registro-nacional-tecnologias-medicas-anmat',
        parent_domain: 'anmat.gob.ar',
        access_method: 'DIRECT_PULL',
        protocol: 'REST_API',
        geography_scope: 'ARGENTINA',
        topics: ['salud', 'equipamiento_medico', 'dispositivos', 'clinica', 'habilitaciones'],
        entity_types_observed: ['PRODUCT', 'TECHNOLOGY', 'COMPANY'],
        relation_types_observed: ['CERTIFIED_BY', 'MANUFACTURED_BY'],
        evidence_types_observed: ['ANMAT_CERTIFICATION', 'PRODUCT_REGISTRATION'],
        evidence_goals_solved: ['applied_transfer_evidence'],
        source_class: 'OFFICIAL_REGISTRY',
        volume_estimate: 24000,
        realized_yield: 0.94,
        qualified_yield: 0.89,
        qualified_per_second: 13.0,
        novelty: 0.85,
        overlap: 0.12,
        latency_ms: 105,
        reliability_score: 0.98,
        saturation: 0.16,
        current_status: 'PROMOTED',
        last_tested: '2026-03-24T12:00:00Z',
        last_success: '2026-03-24T12:00:00Z',
        failure_modes: []
      },
      {
        source_id: 'SRC_REFAR_ESTABLECIMIENTOS_FARMACIAS',
        source_name: 'Registro Federal de Establecimientos de Salud (REFAR / MinSalud)',
        source_family: 'MINSALUD_REFAR',
        source_universe: 'HEALTH_REGULATORY_NATIONAL',
        canonical_url: 'https://sisa.msal.gov.ar/sisa/#sisa',
        parent_domain: 'sisa.msal.gov.ar',
        access_method: 'DIRECT_PULL',
        protocol: 'CSV_STREAM',
        geography_scope: 'ARGENTINA',
        topics: ['farmacia', 'farmacias', 'botica', 'salud', 'establecimientos_salud', 'medicamentos'],
        entity_types_observed: ['ESTABLISHMENT', 'COMPANY'],
        relation_types_observed: ['PHARMACY', 'DISPENSING', 'HEALTHCARE_PROVIDER'],
        evidence_types_observed: ['OFFICIAL_PHARMACY_REGISTRY_RECORD', 'REFAR_HABILITATION'],
        evidence_goals_solved: ['establishment_identity', 'pharmacy_activity_evidence', 'geography_evidence'],
        source_class: 'OFFICIAL_REGISTRY',
        volume_estimate: 13580,
        realized_yield: 0.99,
        qualified_yield: 0.99,
        qualified_per_second: 50.0,
        novelty: 0.98,
        overlap: 0.02,
        latency_ms: 10,
        reliability_score: 0.99,
        saturation: 0.05,
        current_status: 'PROMOTED',
        last_tested: '2026-10-02T12:00:00Z',
        last_success: '2026-10-02T12:00:00Z',
        failure_modes: []
      }
    ];

    for (const s of foundational) {
      this.sources.set(s.source_id, s);
    }
  }
}
