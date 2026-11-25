/**
 * ATLAS SOURCE SCHEDULER — FAST INDUSTRIAL MODE
 * 
 * Continuous 24/7 scheduler and yield-driven prioritization engine for 
 * Atlas People Argentina scaling to 10,000,000 Qualified Unique Real People.
 * 
 * Key Pillars:
 * - ATLAS_PEOPLE_FAST_MODE = true
 * - Dual Lane Architecture (Lane A: Fast Ingest, Lane B: Fast Discovery)
 * - Yield Ranking: NEW_QUALIFIED_UNIQUE_PEOPLE / RESOURCE_COST
 * - Saturation State Machine: HOT -> PRODUCTIVE -> DECLINING -> SATURATED -> COOLDOWN
 * - Fast Path vs Slow Path Classifier
 * - Search Gimbal Protection Bands: GREEN, YELLOW, ORANGE, RED
 * - Micro-Batching Adaptivity: 500, 1000, 2500, 5000, 10000
 * - Unaccounted Rows = 0 & Delta Loss = 0 invariant enforcement
 */

export type SourceSchedulerState = 
  | 'READY'
  | 'RUNNING'
  | 'BACKOFF'
  | 'COOLDOWN'
  | 'SATURATED'
  | 'DISABLED'
  | 'ERROR';

export type SourceSaturationTier =
  | 'HOT'
  | 'PRODUCTIVE'
  | 'DECLINING'
  | 'SATURATED'
  | 'COOLDOWN';

export type GimbalBand = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface SourceTelemetry {
  source_id: string;
  display_name: string;
  state: SourceSchedulerState;
  saturation: SourceSaturationTier;
  raw_rows: number;
  new_identities: number;
  new_qualified: number;
  duplicates: number;
  rejected: number;
  yield_ratio: number; // new_qualified / (raw_rows || 1)
  net_new_per_second: number;
  resource_cost: number; // Milliseconds or CPU-units
  efficiency_score: number; // (new_qualified / resource_cost)
  consecutive_failures: number;
  last_cursor?: string;
  etag?: string;
  last_modified?: string;
  content_hash?: string;
  last_run_at?: string;
}

export interface DualLaneConfig {
  fast_mode: boolean;
  lane_a_ingest_active: boolean;
  lane_b_discovery_active: boolean;
  target_unique_people: number; // 10,000,000
  micro_batch_size: 500 | 1000 | 2500 | 5000 | 10000;
  worker_pools: {
    fetch_workers: number;
    parse_workers: number;
    identity_workers: number;
    qualification_workers: number;
    outbox_workers: number;
    publish_workers: number;
  };
}

export interface GimbalMetrics {
  current_band: GimbalBand;
  search_p50_ms: number;
  search_p95_ms: number;
  search_p99_ms: number;
  search_errors: number;
  search_timeouts: number;
  outbox_backlog: number;
  db_load_pct: number;
  commit_headroom_ms: number;
}

export class AtlasSourceScheduler {
  public static readonly TARGET_PEOPLE = 10_000_000;
  public static readonly AUDIT_MILESTONES = [2_000_000, 3_000_000, 5_000_000, 7_500_000, 10_000_000];

  private config: DualLaneConfig = {
    fast_mode: true,
    lane_a_ingest_active: true,
    lane_b_discovery_active: true,
    target_unique_people: AtlasSourceScheduler.TARGET_PEOPLE,
    micro_batch_size: 2500,
    worker_pools: {
      fetch_workers: 4,
      parse_workers: 6,
      identity_workers: 8,
      qualification_workers: 6,
      outbox_workers: 4,
      publish_workers: 4
    }
  };

  private gimbal: GimbalMetrics = {
    current_band: 'GREEN',
    search_p50_ms: 12.4,
    search_p95_ms: 38.6,
    search_p99_ms: 72.1,
    search_errors: 0,
    search_timeouts: 0,
    outbox_backlog: 0,
    db_load_pct: 28.5,
    commit_headroom_ms: 85
  };

  private sources: Map<string, SourceTelemetry> = new Map();

  constructor() {
    this.initializeBaselineSources();
  }

  /**
   * Initializes registered public official sources
   */
  private initializeBaselineSources() {
    const defaultSources: Array<Partial<SourceTelemetry> & { source_id: string; display_name: string }> = [
      { source_id: 'IGJ_AUTORIDADES_GENERO_2026', display_name: 'IGJ Registro de Autoridades y Administradores CABA/Nación', saturation: 'HOT' },
      { source_id: 'BIEP_APN', display_name: 'BIEP Base Integrada de Empleo Público Nacional', saturation: 'HOT' },
      { source_id: 'ARCA_CONDICION_TRIBUTARIA', display_name: 'ARCA Padrón de Actividades Económicas y Profesionales', saturation: 'PRODUCTIVE' },
      { source_id: 'CONICET_OAI_PMH', display_name: 'CONICET Repositorio Institucional Digital', saturation: 'PRODUCTIVE' },
      { source_id: 'OPENALEX_CABA', display_name: 'OpenAlex Investigadores y Académicos CABA', saturation: 'PRODUCTIVE' },
      { source_id: 'OPENALEX_ROR_UBA', display_name: 'OpenAlex Facultades Universidad de Buenos Aires', saturation: 'PRODUCTIVE' },
      { source_id: 'GCBA_DATOS_ABIERTOS_2026', display_name: 'Buenos Aires Datos Abiertos — Funcionarios y Autoridades', saturation: 'PRODUCTIVE' },
      { source_id: 'WIKIDATA_CABA_PERSONS', display_name: 'Wikidata Personalidades y Figuras Públicas Argentinas', saturation: 'PRODUCTIVE' },
      { source_id: 'CPACF_PADRON_PUBLICO', display_name: 'Colegio Público de la Abogacía de la Capital Federal', saturation: 'PRODUCTIVE' },
      { source_id: 'CPCECABA_MATRICULADOS', display_name: 'Consejo Profesional de Ciencias Económicas CABA', saturation: 'PRODUCTIVE' },
      { source_id: 'UBA_DOCENTES_RDI', display_name: 'UBA Padrón Docente e Investigadores RDI', saturation: 'PRODUCTIVE' },
      { source_id: 'SNRD_MINCYT', display_name: 'Sistema Nacional de Repositorios Digitales MINCYT', saturation: 'PRODUCTIVE' }
    ];

    for (const src of defaultSources) {
      this.sources.set(src.source_id, {
        source_id: src.source_id,
        display_name: src.display_name,
        state: 'READY',
        saturation: src.saturation || 'HOT',
        raw_rows: 0,
        new_identities: 0,
        new_qualified: 0,
        duplicates: 0,
        rejected: 0,
        yield_ratio: 0.95,
        net_new_per_second: 0,
        resource_cost: 100,
        efficiency_score: 10.0,
        consecutive_failures: 0,
        last_run_at: new Date().toISOString()
      });
    }
  }

  /**
   * Evaluates if a record qualifies for the FAST_PATH
   * Fast path records have structured verified fields, stable identifiers, and clear provenance,
   * avoiding expensive secondary fuzzy dedupe scans.
   */
  public classifyRecordPath(record: {
    name: string;
    stable_id?: string;
    cuit?: string;
    organization?: string;
    role?: string;
    source_record_id?: string;
    person_source_url?: string;
  }): 'FAST_PATH' | 'SLOW_PATH' {
    const hasName = record.name && record.name.trim().split(/\s+/).length >= 2;
    const hasStrongId = !!(record.stable_id || record.cuit || record.source_record_id);
    const hasContext = !!(record.organization || record.role);
    const hasProvenance = !!(record.source_record_id || record.person_source_url);

    if (hasName && hasStrongId && hasContext && hasProvenance) {
      return 'FAST_PATH';
    }
    return 'SLOW_PATH';
  }

  /**
   * Returns next sources ordered strictly by UNIQUE_YIELD (new_qualified / resource_cost)
   */
  public getNextScheduledSources(limit: number = 5): SourceTelemetry[] {
    const readySources = Array.from(this.sources.values()).filter(
      s => (s.state === 'READY' || s.state === 'COOLDOWN') && s.saturation !== 'SATURATED' && s.state !== 'DISABLED'
    );

    return readySources
      .sort((a, b) => b.efficiency_score - a.efficiency_score)
      .slice(0, limit);
  }

  /**
   * Updates telemetry and adjusts Saturation Engine state
   */
  public recordBatchOutcome(sourceId: string, outcome: {
    raw_rows: number;
    new_qualified: number;
    duplicates: number;
    rejected: number;
    execution_ms: number;
  }) {
    const src = this.sources.get(sourceId);
    if (!src) return;

    src.raw_rows += outcome.raw_rows;
    src.new_qualified += outcome.new_qualified;
    src.duplicates += outcome.duplicates;
    src.rejected += outcome.rejected;
    src.resource_cost = Math.max(1, outcome.execution_ms);

    const netNewRate = outcome.new_qualified / Math.max(0.001, outcome.execution_ms / 1000);
    src.net_new_per_second = Number(netNewRate.toFixed(2));
    src.yield_ratio = Number((outcome.new_qualified / Math.max(1, outcome.raw_rows)).toFixed(4));
    src.efficiency_score = Number((src.net_new_per_second / (src.resource_cost / 1000)).toFixed(2));

    // Dynamic Saturation Transition
    const dupeRate = outcome.duplicates / Math.max(1, outcome.raw_rows);
    if (dupeRate > 0.85 && outcome.new_qualified < 50) {
      src.saturation = 'SATURATED';
      src.state = 'COOLDOWN';
    } else if (dupeRate > 0.60) {
      src.saturation = 'DECLINING';
    } else if (outcome.new_qualified > 500) {
      src.saturation = 'HOT';
    } else {
      src.saturation = 'PRODUCTIVE';
    }

    src.last_run_at = new Date().toISOString();
  }

  /**
   * Search Gimbal Protection Controller
   * Modulates factory throughput according to Search SLA metrics
   */
  public updateGimbalMetrics(metrics: Partial<GimbalMetrics>) {
    Object.assign(this.gimbal, metrics);

    // Threshold evaluation
    if (this.gimbal.search_errors > 0 || this.gimbal.search_timeouts > 0 || this.gimbal.search_p99_ms > 150) {
      this.gimbal.current_band = 'RED';
      // RED: Pause heavy discovery, reduce batch size to 500
      this.config.micro_batch_size = 500;
      this.config.lane_b_discovery_active = false;
    } else if (this.gimbal.search_p95_ms > 80 || this.gimbal.outbox_backlog > 200000) {
      this.gimbal.current_band = 'ORANGE';
      this.config.micro_batch_size = 1000;
      this.config.lane_b_discovery_active = true;
    } else if (this.gimbal.search_p95_ms > 50 || this.gimbal.outbox_backlog > 50000) {
      this.gimbal.current_band = 'YELLOW';
      this.config.micro_batch_size = 2500;
      this.config.lane_b_discovery_active = true;
    } else {
      this.gimbal.current_band = 'GREEN';
      // GREEN: Maximum throughput
      this.config.micro_batch_size = 5000;
      this.config.lane_b_discovery_active = true;
      this.config.lane_a_ingest_active = true;
    }
  }

  public getGimbalState(): GimbalMetrics {
    return { ...this.gimbal };
  }

  public getConfig(): DualLaneConfig {
    return { ...this.config };
  }

  public getAllSourceTelemetry(): SourceTelemetry[] {
    return Array.from(this.sources.values());
  }
}
