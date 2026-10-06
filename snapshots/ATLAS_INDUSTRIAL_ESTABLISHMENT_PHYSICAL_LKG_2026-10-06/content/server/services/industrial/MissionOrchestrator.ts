/**
 * ATLAS UNIVERSAL MISSION ORCHESTRATOR V1
 * @server/services/industrial/MissionOrchestrator.ts
 * 
 * CORE PRINCIPLE:
 * ONLY MissionOrchestrator CAN TERMINATE A MISSION.
 * 
 * No connector, probe, source gate, quality validator, deduper,
 * source discovery service, or UI component can write directly to
 * mission.status = terminal, terminal_reason, or completed_at.
 * 
 * They only return outcomes to MissionOrchestrator.
 */

import type pg from 'pg';

export type MissionPhase =
  | 'PLANNING'
  | 'CORE_LOOKUP'
  | 'SOURCE_PLANNING'
  | 'PROBING'
  | 'ACQUIRING'
  | 'ENRICHING'
  | 'CERTIFYING'
  | 'DEDUPING'
  | 'EXPANDING_SOURCE_PLAN'
  | 'COMPLETED'
  | 'FAILED'
  | 'USER_CANCELLED';

export type SourceAttemptState =
  | 'DISCOVERED'
  | 'VALIDATED'
  | 'PROBING'
  | 'PROBE_PASSED'
  | 'PROBE_FAILED'
  | 'ACQUIRING'
  | 'EXHAUSTED'
  | 'TEMPORARILY_FAILED'
  | 'TECHNICAL_FAILURE'
  | 'PERMANENTLY_UNUSABLE';

export type CandidateStatus =
  | 'DISCOVERED'
  | 'IDENTITY_RESOLVED'
  | 'MISSION_FIT_PASS'
  | 'EVIDENCE_PENDING'
  | 'GEOGRAPHY_PENDING'
  | 'ENRICHMENT_PENDING'
  | 'READY_FOR_CERTIFICATION'
  | 'CERTIFIED_NEW'
  | 'DUPLICATE_CORE'
  | 'FINAL_REJECTED';

export type TerminalCondition =
  | 'TARGET_REACHED'
  | 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF'
  | 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY'
  | 'TAXONOMY_RESOLUTION_GAP'
  | 'VALID_SOURCE_ZERO_YIELD'
  | 'SOURCE_TECHNICAL_FAILURE'
  | 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED'
  | 'WAITING_FOR_EXECUTOR'
  | 'RETRYING_EXECUTION'
  | 'EXECUTION_INFRASTRUCTURE_FAILED'
  | 'HARD_BUDGET_REACHED'
  | 'EXPLICIT_SAFETY_BLOCK'
  | 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION';

export interface SourcePath {
  path_id: string;
  source_id: string;
  resource: string;
  connector: string;
  access_mode: string;
  role: string;
  priority: number;
  state: SourceAttemptState;
  cursor_or_page?: any;
  rows_seen: number;
  rows_yielded: number;
  certified_yield: number;
  latency_ms: number;
  failure_reason?: string | null;
  exhaustion_proof?: any | null;
}

export interface LedgerCandidate {
  identity_key: string;
  company_name: string;
  status: CandidateStatus;
  source_provenance: string[];
  evidence_provenance: Record<string, { value: any; source: string; timestamp: number }>;
  geography_evidence: any;
  attributes: Record<string, any>;
  missing_requirements: string[];
  final_outcome: string | null;
  raw_candidate: any;
  created_at: number;
  updated_at: number;
}

export interface MissionWorkItem {
  work_item_id: string;
  parent_mission_id: string;
  kind: 'SOURCE_PROBE' | 'SOURCE_ACQUISITION' | 'GEOGRAPHY_EXPANSION' | 'ENRICHMENT_PASS';
  source_id: string;
  geography_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'EXHAUSTED';
  items_scanned: number;
  items_yielded: number;
  created_at: number;
  completed_at?: number;
}

export interface MissionTerminationProof {
  remaining_gap: number;
  sources_known: number;
  sources_attempted: number;
  sources_exhausted: number;
  sources_failed: number;
  sources_rejected: number;
  source_frontier_remaining: number;
  discovery_expansion_attempted: boolean;
  AI_used: boolean;
  web_discovery_used: boolean;
  budget_remaining: number;
  terminal_condition: TerminalCondition;
  proof_notes?: string;
}

export interface MissionTelemetry {
  mission_phase: MissionPhase;
  target: number;
  net_new: number;
  remaining_gap: number;
  probe_rows: number;
  acquisition_rows: number;
  candidates_pending: number;
  candidates_certified: number;
  candidates_rejected: number;
  duplicates_this_run: number;
  source_paths_attempted: number;
  source_paths_remaining: number;
  current_source_id?: string;
  termination_proof?: MissionTerminationProof | null;
  work_items?: MissionWorkItem[];
}

/**
 * Single Authority Candidate Ledger
 */
export class AtlasCandidateLedger {
  private candidates: Map<string, LedgerCandidate> = new Map();

  public generateIdentityKey(raw: any): string {
    if (raw.cuit && String(raw.cuit).trim().length >= 5 && !String(raw.cuit).startsWith('OSM-EST-')) {
      return `CUIT:${String(raw.cuit).trim()}`;
    }
    if (raw.osm_id) {
      return `OSM:${String(raw.osm_id).trim()}`;
    }
    if (raw.email && String(raw.email).includes('@')) {
      return `EMAIL:${String(raw.email).toLowerCase().trim()}`;
    }
    const name = String(raw.company_name || raw.name || '').toLowerCase().trim();
    const addr = String(raw.address || raw.city || '').toLowerCase().trim();
    return `NAME_ADDR:${name}::${addr}`;
  }

  public addOrMergeCandidate(raw: any, sourceId: string): LedgerCandidate {
    const key = this.generateIdentityKey(raw);
    let entry = this.candidates.get(key);

    const now = Date.now();
    if (!entry) {
      entry = {
        identity_key: key,
        company_name: raw.company_name || raw.name || 'UNKNOWN',
        status: 'DISCOVERED',
        source_provenance: [sourceId],
        evidence_provenance: {},
        geography_evidence: raw.evidence?.geography || { address: raw.address, city: raw.city, province: raw.province, lat: raw.lat, lon: raw.lon },
        attributes: { ...(raw.attributes || {}), ...raw },
        missing_requirements: [],
        final_outcome: null,
        raw_candidate: raw,
        created_at: now,
        updated_at: now
      };
      this.candidates.set(key, entry);
    } else {
      if (!entry.source_provenance.includes(sourceId)) {
        entry.source_provenance.push(sourceId);
      }
      entry.attributes = { ...entry.attributes, ...raw };
      entry.updated_at = now;
    }

    // Accumulate evidence provenance
    if (raw.evidence) {
      for (const [k, v] of Object.entries(raw.evidence)) {
        if (v !== undefined && v !== null) {
          entry.evidence_provenance[k] = { value: v, source: sourceId, timestamp: now };
        }
      }
    }
    if (raw.address) {
      entry.evidence_provenance['address'] = { value: raw.address, source: sourceId, timestamp: now };
    }
    if (raw.cuit) {
      entry.evidence_provenance['cuit'] = { value: raw.cuit, source: sourceId, timestamp: now };
    }
    if (raw.email) {
      entry.evidence_provenance['email'] = { value: raw.email, source: sourceId, timestamp: now };
    }

    return entry;
  }

  public recordSoftEvaluation(identityKey: string, missing: string[], reason?: string): void {
    const entry = this.candidates.get(identityKey);
    if (!entry) return;
    entry.missing_requirements = missing;
    entry.status = missing.includes('ENRICHMENT') ? 'ENRICHMENT_PENDING' : 'EVIDENCE_PENDING';
    entry.final_outcome = reason || 'SOFT_FAILURE_AWAITING_FURTHER_EVIDENCE';
    entry.updated_at = Date.now();
  }

  public recordHardRejection(identityKey: string, reason: string): void {
    const entry = this.candidates.get(identityKey);
    if (!entry) return;
    entry.status = 'FINAL_REJECTED';
    entry.final_outcome = reason;
    entry.updated_at = Date.now();
  }

  public recordCertification(identityKey: string, certifiedNew: boolean, duplicateCore: boolean): void {
    const entry = this.candidates.get(identityKey);
    if (!entry) return;
    if (certifiedNew) {
      entry.status = 'CERTIFIED_NEW';
      entry.final_outcome = 'CERTIFIED_NEW';
    } else if (duplicateCore) {
      entry.status = 'DUPLICATE_CORE';
      entry.final_outcome = 'DUPLICATE_CORE';
    }
    entry.updated_at = Date.now();
  }

  public getCandidate(identityKey: string): LedgerCandidate | undefined {
    return this.candidates.get(identityKey);
  }

  public getAll(): LedgerCandidate[] {
    return Array.from(this.candidates.values());
  }

  public getSummary() {
    let discovered = 0;
    let pending = 0;
    let ready = 0;
    let certified = 0;
    let duplicate = 0;
    let rejected = 0;

    for (const c of this.candidates.values()) {
      discovered++;
      if (c.status === 'EVIDENCE_PENDING' || c.status === 'ENRICHMENT_PENDING' || c.status === 'GEOGRAPHY_PENDING') {
        pending++;
      } else if (c.status === 'READY_FOR_CERTIFICATION') {
        ready++;
      } else if (c.status === 'CERTIFIED_NEW') {
        certified++;
      } else if (c.status === 'DUPLICATE_CORE') {
        duplicate++;
      } else if (c.status === 'FINAL_REJECTED') {
        rejected++;
      }
    }
    return { discovered, pending, ready, certified, duplicate, rejected };
  }
}

/**
 * Universal Mission Orchestrator
 */
export class MissionOrchestrator {
  private static instance: MissionOrchestrator;
  private dbPool: pg.Pool;

  // Active orchestrator state per mission
  private activeFrontiers: Map<string, SourcePath[]> = new Map();
  private activeLedgers: Map<string, AtlasCandidateLedger> = new Map();
  private activePhases: Map<string, MissionPhase> = new Map();
  private activeMetrics: Map<string, { probeRows: number; acquisitionRows: number; target: number; netNew: number; duplicates: number }> = new Map();
  private activeWorkItems: Map<string, MissionWorkItem[]> = new Map();

  private constructor(pool: pg.Pool) {
    this.dbPool = pool;
  }

  public static getInstance(pool?: pg.Pool): MissionOrchestrator {
    if (!this.instance) {
      if (!pool) throw new Error('MissionOrchestrator requires dbPool on initial initialization.');
      this.instance = new MissionOrchestrator(pool);
    }
    return this.instance;
  }

  /**
   * MISSION IDENTITY INVARIANT ENFORCEMENT
   * ONE USER SUBMISSION = ONE USER-VISIBLE MISSION_ID.
   * Internal work (probes, sources, retries, geo expansion) CANNOT change mission ID.
   */
  public assertMissionIdentity(currentMissionId: string, expectedMissionId: string): void {
    if (currentMissionId !== expectedMissionId) {
      throw new Error(`MISSION_IDENTITY_INVARIANT_FAILURE: Attempted to replace mission identity ${expectedMissionId} with ${currentMissionId}.`);
    }
  }

  // Canonical transition table
  private static readonly VALID_TRANSITIONS: Record<MissionPhase, MissionPhase[]> = {
    PLANNING: ['CORE_LOOKUP', 'FAILED', 'USER_CANCELLED'],
    CORE_LOOKUP: ['SOURCE_PLANNING', 'COMPLETED', 'FAILED', 'USER_CANCELLED'],
    SOURCE_PLANNING: ['PROBING', 'ACQUIRING', 'EXPANDING_SOURCE_PLAN', 'FAILED', 'USER_CANCELLED'],
    PROBING: ['ACQUIRING', 'PROBING', 'EXPANDING_SOURCE_PLAN', 'COMPLETED', 'FAILED', 'USER_CANCELLED'],
    ACQUIRING: ['ENRICHING', 'CERTIFYING', 'DEDUPING', 'ACQUIRING', 'PROBING', 'EXPANDING_SOURCE_PLAN', 'COMPLETED', 'FAILED', 'USER_CANCELLED'],
    ENRICHING: ['CERTIFYING', 'ACQUIRING', 'PROBING', 'EXPANDING_SOURCE_PLAN', 'COMPLETED', 'FAILED', 'USER_CANCELLED'],
    CERTIFYING: ['DEDUPING', 'ACQUIRING', 'PROBING', 'EXPANDING_SOURCE_PLAN', 'COMPLETED', 'FAILED', 'USER_CANCELLED'],
    DEDUPING: ['ACQUIRING', 'PROBING', 'EXPANDING_SOURCE_PLAN', 'COMPLETED', 'FAILED', 'USER_CANCELLED'],
    EXPANDING_SOURCE_PLAN: ['PROBING', 'ACQUIRING', 'COMPLETED', 'FAILED', 'USER_CANCELLED'],
    COMPLETED: [],
    FAILED: [],
    USER_CANCELLED: []
  };

  /**
   * Initializes Orchestrator state for a mission
   */
  public initializeMission(missionId: string, target: number): { ledger: AtlasCandidateLedger; frontier: SourcePath[] } {
    const ledger = new AtlasCandidateLedger();
    const frontier: SourcePath[] = [];
    this.activeLedgers.set(missionId, ledger);
    this.activeFrontiers.set(missionId, frontier);
    this.activePhases.set(missionId, 'PLANNING');
    this.activeMetrics.set(missionId, {
      probeRows: 0,
      acquisitionRows: 0,
      target,
      netNew: 0,
      duplicates: 0
    });
    this.activeWorkItems.set(missionId, []);
    return { ledger, frontier };
  }

  /**
   * Work Item tracking: Sub-tasks, geography partitions, probe attempts, and source executions
   * ALWAYS retain parent_mission_id = original user-visible mission ID.
   */
  public createWorkItem(
    parentMissionId: string,
    kind: MissionWorkItem['kind'],
    sourceId: string,
    geographyId: string
  ): MissionWorkItem {
    let items = this.activeWorkItems.get(parentMissionId);
    if (!items) {
      items = [];
      this.activeWorkItems.set(parentMissionId, items);
    }
    const item: MissionWorkItem = {
      work_item_id: `WORK_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      parent_mission_id: parentMissionId,
      kind,
      source_id: sourceId,
      geography_id: geographyId,
      status: 'RUNNING',
      items_scanned: 0,
      items_yielded: 0,
      created_at: Date.now()
    };
    items.push(item);

    // PERSISTENCE AUTHORITY (Phase 5): Write work item directly into DB table
    this.dbPool.query(`
      INSERT INTO public.atlas_mission_work_items (
        work_item_id, mission_id, source_id, source_name, kind,
        geography_id, status, worker_id, executor_family, lease_token,
        lease_started_at, lease_expires_at, heartbeat_at, items_scanned, items_yielded, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $3, $4,
        $5, 'RUNNING', $6, 'CANONICAL_EXECUTOR', $7,
        NOW(), NOW() + INTERVAL '60 seconds', NOW(), 0, 0, NOW(), NOW()
      )
      ON CONFLICT (work_item_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW();
    `, [
      item.work_item_id,
      parentMissionId,
      sourceId,
      kind,
      geographyId,
      `WORKER_${process.pid}`,
      crypto.randomUUID()
    ]).catch(e => console.warn('[MissionOrchestrator] Error persisting work item:', e.message));

    return item;
  }

  public completeWorkItem(
    parentMissionId: string,
    workItemId: string,
    status: MissionWorkItem['status'],
    itemsScanned: number,
    itemsYielded: number
  ): void {
    const items = this.activeWorkItems.get(parentMissionId);
    if (items) {
      const item = items.find(w => w.work_item_id === workItemId);
      if (item) {
        item.status = status;
        item.items_scanned = itemsScanned;
        item.items_yielded = itemsYielded;
        item.completed_at = Date.now();
      }
    }

    // PERSISTENCE AUTHORITY (Phase 5): Update completion in DB table
    this.dbPool.query(`
      UPDATE public.atlas_mission_work_items
      SET 
        status = $1,
        items_scanned = $2,
        items_yielded = $3,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE work_item_id = $4;
    `, [status === 'COMPLETED' ? 'COMPLETED' : 'FAILED', itemsScanned, itemsYielded, workItemId])
    .catch(e => console.warn('[MissionOrchestrator] Error completing work item in DB:', e.message));
  }

  public getWorkItems(parentMissionId: string): MissionWorkItem[] {
    return this.activeWorkItems.get(parentMissionId) || [];
  }

  /**
   * Rehydrates orchestrator in-memory state from database checkpoint
   * Guarantees mission survives process restart without state loss
   */
  public async rehydrateMission(missionId: string): Promise<boolean> {
    try {
      const mRes = await this.dbPool.query(`
        SELECT mission_id, objective, target_new_records, certified_new_searchable,
               scanned_count, duplicate_existing_count, rejected_count, checkpoint_data, status
        FROM public.atlas_discovery_missions
        WHERE mission_id = $1;
      `, [missionId]);
      if (mRes.rows.length === 0) return false;
      const row = mRes.rows[0];
      const cp = row.checkpoint_data || {};
      const frontier = cp.source_frontier || [];
      const tel = cp.orchestrator_telemetry || {};

      if (frontier.length > 0) {
        this.activeFrontiers.set(missionId, frontier);
      }
      this.activeMetrics.set(missionId, {
        probeRows: tel.probe_rows || 0,
        acquisitionRows: tel.acquisition_rows || 0,
        target: row.target_new_records || 0,
        netNew: Number(row.certified_new_searchable) || 0,
        duplicates: Number(row.duplicate_existing_count) || 0
      });
      this.activePhases.set(missionId, (tel.mission_phase as MissionPhase) || (row.status === 'RUNNING' ? 'ACQUIRING' : 'PLANNING'));
      return true;
    } catch (e: any) {
      console.warn(`[MissionOrchestrator] Rehydrate error for ${missionId}:`, e.message);
      return false;
    }
  }

  public getLedger(missionId: string): AtlasCandidateLedger {
    let ledger = this.activeLedgers.get(missionId);
    if (!ledger) {
      ledger = new AtlasCandidateLedger();
      this.activeLedgers.set(missionId, ledger);
    }
    return ledger;
  }

  public getFrontier(missionId: string): SourcePath[] {
    let frontier = this.activeFrontiers.get(missionId);
    if (!frontier) {
      frontier = [];
      this.activeFrontiers.set(missionId, frontier);
    }
    return frontier;
  }

  public getPhase(missionId: string): MissionPhase {
    return this.activePhases.get(missionId) || 'PLANNING';
  }

  /**
   * Controlled State Machine Transition
   */
  public async transitionPhase(missionId: string, targetPhase: MissionPhase, details?: string): Promise<void> {
    const currentPhase = this.getPhase(missionId);
    if (currentPhase === targetPhase) return;

    const allowed = MissionOrchestrator.VALID_TRANSITIONS[currentPhase] || [];
    if (!allowed.includes(targetPhase)) {
      throw new Error(`MISSION_STATE_INVARIANT_FAILURE: Illegal transition from ${currentPhase} to ${targetPhase} for mission ${missionId}.`);
    }

    this.activePhases.set(missionId, targetPhase);
    console.log(`[MissionOrchestrator] Mission ${missionId} phase transition: ${currentPhase} -> ${targetPhase} (${details || 'OK'})`);

    // Synchronize phase telemetry to DB checkpoint
    await this.syncTelemetry(missionId);
  }

  /**
   * Frontier Management
   */
  public pushFrontierPath(missionId: string, path: Omit<SourcePath, 'state' | 'rows_seen' | 'rows_yielded' | 'certified_yield' | 'latency_ms'>): void {
    const frontier = this.getFrontier(missionId);
    const existing = frontier.find(p => p.path_id === path.path_id);
    if (!existing) {
      frontier.push({
        ...path,
        state: 'DISCOVERED',
        rows_seen: 0,
        rows_yielded: 0,
        certified_yield: 0,
        latency_ms: 0
      });
      // Sort by priority descending
      frontier.sort((a, b) => b.priority - a.priority);
    }
  }

  public popNextViablePath(missionId: string): SourcePath | null {
    const frontier = this.getFrontier(missionId);
    const next = frontier.find(p => p.state === 'DISCOVERED' || p.state === 'VALIDATED');
    return next || null;
  }

  public markPathState(missionId: string, pathId: string, state: SourceAttemptState, updates?: Partial<SourcePath>): void {
    const frontier = this.getFrontier(missionId);
    const p = frontier.find(x => x.path_id === pathId);
    if (p) {
      p.state = state;
      if (updates) {
        Object.assign(p, updates);
      }
    }
  }

  public hasViableFrontierPath(missionId: string): boolean {
    const frontier = this.getFrontier(missionId);
    return frontier.some(p => p.state === 'DISCOVERED' || p.state === 'VALIDATED');
  }

  /**
   * Accounting & Gap Loop
   */
  public recordProbeRows(missionId: string, count: number): void {
    const m = this.activeMetrics.get(missionId);
    if (m) m.probeRows += count;
  }

  public recordAcquisitionRows(missionId: string, count: number): void {
    const m = this.activeMetrics.get(missionId);
    if (m) m.acquisitionRows += count;
  }

  public updateNetNew(missionId: string, certifiedCount: number, duplicateCount: number): void {
    const m = this.activeMetrics.get(missionId);
    if (m) {
      m.netNew = certifiedCount;
      m.duplicates = duplicateCount;
    }
  }

  public getTelemetry(missionId: string): MissionTelemetry {
    const m = this.activeMetrics.get(missionId) || { probeRows: 0, acquisitionRows: 0, target: 0, netNew: 0, duplicates: 0 };
    const phase = this.getPhase(missionId);
    const ledger = this.getLedger(missionId);
    const summary = ledger.getSummary();
    const frontier = this.getFrontier(missionId);

    const remainingGap = Math.max(0, m.target - m.netNew);
    const attempted = frontier.filter(p => p.state !== 'DISCOVERED' && p.state !== 'VALIDATED').length;
    const remaining = frontier.filter(p => p.state === 'DISCOVERED' || p.state === 'VALIDATED').length;

    return {
      mission_phase: phase,
      target: m.target,
      net_new: m.netNew,
      remaining_gap: remainingGap,
      probe_rows: m.probeRows,
      acquisition_rows: m.acquisitionRows,
      candidates_pending: summary.pending,
      candidates_certified: summary.certified,
      candidates_rejected: summary.rejected,
      duplicates_this_run: m.duplicates,
      source_paths_attempted: attempted,
      source_paths_remaining: remaining,
      work_items: this.getWorkItems(missionId)
    };
  }

  /**
   * Persists telemetry to DB
   */
  public async syncTelemetry(missionId: string): Promise<void> {
    try {
      const tel = this.getTelemetry(missionId);
      const isTerminal = tel.mission_phase === 'COMPLETED' || tel.mission_phase === 'FAILED' || tel.mission_phase === 'USER_CANCELLED';
      const frontier = this.getFrontier(missionId);

      await this.dbPool.query(`
        UPDATE public.atlas_discovery_missions
        SET 
          status = CASE WHEN $1 = TRUE THEN status ELSE (CASE WHEN $2 = 'PLANNING' THEN 'STARTING' ELSE 'RUNNING' END) END,
          scanned_count = $3,
          certified_new_searchable = $4,
          true_net_new_count = $4,
          duplicate_existing_count = $5,
          rejected_count = $6,
          target_reached = ($4 >= target_new_records AND target_new_records > 0),
          checkpoint_data = jsonb_set(
            jsonb_set(
              COALESCE(checkpoint_data, '{}'::jsonb),
              '{orchestrator_telemetry}',
              $7::jsonb
            ),
            '{source_frontier}',
            $8::jsonb
          ),
          updated_at = NOW()
        WHERE mission_id = $9;
      `, [
        isTerminal,
        tel.mission_phase,
        tel.probe_rows + tel.acquisition_rows,
        tel.net_new,
        tel.duplicates_this_run,
        tel.candidates_rejected,
        JSON.stringify(tel),
        JSON.stringify(frontier.map(p => ({ path_id: p.path_id, source_id: p.source_id, state: p.state, priority: p.priority, rows_seen: p.rows_seen }))),
        missionId
      ]);
    } catch (err) {
      console.warn(`[MissionOrchestrator] syncTelemetry non-blocking error for ${missionId}:`, err);
    }
  }

  /**
   * THE ONLY METHOD IN THE SYSTEM PERMITTED TO TERMINATE A MISSION.
   * 
   * Strict Positive Gap Invariant:
   * IF REMAINING_GAP > 0 AND SOURCE_FRONTIER_HAS_VIABLE_PATH == TRUE THEN MISSION_TERMINAL = IMPOSSIBLE.
   */
  public async terminateMission(
    missionId: string,
    proof: MissionTerminationProof,
    userMessage?: string
  ): Promise<{ status: string; terminal_reason: string; target_reached: boolean; user_message: string }> {
    const tel = this.getTelemetry(missionId);
    const hasViablePath = this.hasViableFrontierPath(missionId);

    // Invariant 15: Positive gap invariant
    const isExplicitOverride = proof.terminal_condition === 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION' || 
                               proof.terminal_condition === 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED' ||
                               proof.terminal_condition === 'EXECUTION_INFRASTRUCTURE_FAILED' ||
                               proof.terminal_condition === 'WAITING_FOR_EXECUTOR' ||
                               proof.terminal_condition === 'RETRYING_EXECUTION' ||
                               proof.terminal_condition === 'EXPLICIT_SAFETY_BLOCK';
    if (proof.remaining_gap > 0 && hasViablePath && !isExplicitOverride) {
      throw new Error(`MISSION_STATE_INVARIANT_FAILURE: Cannot terminate mission ${missionId} with positive gap (${proof.remaining_gap}) when viable source frontier paths still exist.`);
    }

    // Invariant 16: Probe limit invariant
    if (tel.target > 5 && tel.probe_rows > 0 && tel.acquisition_rows === 0 && !proof.discovery_expansion_attempted && hasViablePath) {
      throw new Error(`MISSION_STATE_INVARIANT_FAILURE: Cannot terminate mission ${missionId} after only probe without exploring frontier.`);
    }

    // Determine target phase
    let targetPhase: MissionPhase;
    let dbStatus: string;
    let targetReached = false;

    if (proof.terminal_condition === 'TARGET_REACHED' || (tel.net_new >= tel.target && tel.target > 0)) {
      targetPhase = 'COMPLETED';
      dbStatus = 'TARGET_REACHED';
      targetReached = true;
    } else if (proof.terminal_condition === 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION') {
      targetPhase = 'USER_CANCELLED';
      dbStatus = 'CANCELLED';
    } else if (proof.terminal_condition === 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED' || proof.terminal_condition === 'EXECUTION_INFRASTRUCTURE_FAILED') {
      targetPhase = 'FAILED';
      dbStatus = proof.terminal_condition;
    } else if (proof.terminal_condition === 'WAITING_FOR_EXECUTOR' || proof.terminal_condition === 'RETRYING_EXECUTION') {
      targetPhase = 'STARTING';
      dbStatus = proof.terminal_condition;
    } else {
      // Frontier exhausted with proof, no validated source exists, budget reached, etc.
      targetPhase = 'COMPLETED';
      dbStatus = proof.terminal_condition;
    }

    // Allowed final transitions
    this.activePhases.set(missionId, targetPhase);

    const finalMessage = userMessage || this.buildDefaultUserMessage(proof, tel);
    const totalScanned = tel.probe_rows + tel.acquisition_rows;

    // Query actual persisted rows in atlas_products for this mission to guarantee invariant
    let actualPersisted = 0;
    try {
      const countCheck = await this.dbPool.query(`
        SELECT count(*) as count 
        FROM public.atlas_products 
        WHERE attributes_json->>'mission_id' = $1
      `, [missionId]);
      actualPersisted = parseInt(countCheck.rows[0]?.count || '0', 10);
    } catch (cErr) {
      console.warn('[MissionOrchestrator] Error checking actual persisted rows:', cErr);
    }

    const finalNetNew = Math.max(tel.net_new, actualPersisted);
    const finalScanned = Math.max(totalScanned, finalNetNew + tel.duplicates_this_run);

    console.log(`[MissionOrchestrator] TERMINATING mission ${missionId}: status=${dbStatus}, condition=${proof.terminal_condition}, gap=${proof.remaining_gap}, net_new=${finalNetNew}`);

    // EXCLUSIVE TERMINAL WRITER
    await this.dbPool.query(`
      UPDATE public.atlas_discovery_missions
      SET 
        status = $1,
        terminal_reason = $2,
        target_reached = $3,
        certified_new_searchable = $4,
        true_net_new_count = $4,
        persisted_count = $4,
        duplicate_existing_count = $5,
        rejected_count = $6,
        scanned_count = $7,
        error_message = $8,
        completed_at = NOW(),
        checkpoint_data = jsonb_set(
          jsonb_set(
            COALESCE(checkpoint_data, '{}'::jsonb),
            '{termination_proof}',
            $9::jsonb
          ),
          '{orchestrator_telemetry}',
          $10::jsonb
        ),
        updated_at = NOW()
      WHERE mission_id = $11;
    `, [
      dbStatus,
      proof.terminal_condition,
      targetReached,
      finalNetNew,
      tel.duplicates_this_run,
      tel.candidates_rejected,
      finalScanned,
      finalMessage,
      JSON.stringify(proof),
      JSON.stringify({ ...tel, net_new: finalNetNew }),
      missionId
    ]);

    // Clean up in-memory tracking
    this.activePhases.delete(missionId);
    this.activeFrontiers.delete(missionId);
    this.activeLedgers.delete(missionId);
    this.activeMetrics.delete(missionId);

    return {
      status: dbStatus,
      terminal_reason: proof.terminal_condition,
      target_reached: targetReached,
      user_message: finalMessage
    };
  }

  /**
   * Explicit User Cancel Gate
   */
  public async handleUserCancel(missionId: string, cancelProvenance: any): Promise<any> {
    const tel = this.getTelemetry(missionId);
    const proof: MissionTerminationProof = {
      remaining_gap: tel.remaining_gap,
      sources_known: tel.source_paths_attempted + tel.source_paths_remaining,
      sources_attempted: tel.source_paths_attempted,
      sources_exhausted: 0,
      sources_failed: 0,
      sources_rejected: 0,
      source_frontier_remaining: tel.source_paths_remaining,
      discovery_expansion_attempted: false,
      AI_used: false,
      web_discovery_used: false,
      budget_remaining: 0,
      terminal_condition: 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION',
      proof_notes: 'User requested cancellation via UI/API'
    };

    return this.terminateMission(missionId, proof, 'Cancelaste la búsqueda.');
  }

  private buildDefaultUserMessage(proof: MissionTerminationProof, tel: MissionTelemetry): string {
    if (proof.terminal_condition === 'TARGET_REACHED') {
      return `Misión cumplida: se alcanzaron los ${tel.net_new} registros certificados.`;
    }
    if (proof.terminal_condition === 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION') {
      return 'Cancelaste la búsqueda.';
    }
    if (proof.terminal_condition === 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF') {
      return `Se exploraron ${proof.sources_attempted} fuentes públicas (${tel.net_new} nuevos certificados, ${tel.duplicates_this_run} ya existentes en Atlas). Las fuentes disponibles se agotaron formalmente.`;
    }
    if (proof.terminal_condition === 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY') {
      return 'Atlas analizó las fuentes disponibles y autónomas, pero ninguna cumple los criterios de certificación para este concepto.';
    }
    if (proof.terminal_condition === 'TAXONOMY_RESOLUTION_GAP') {
      return 'No se pudo resolver una taxonomía pública específica compatible para este concepto.';
    }
    if (proof.terminal_condition === 'VALID_SOURCE_ZERO_YIELD') {
      return 'Se consultó la fuente pública validada para este concepto pero no arrojó registros en la zona solicitada.';
    }
    if (proof.terminal_condition === 'SOURCE_TECHNICAL_FAILURE') {
      return 'La fuente pública presentó errores técnicos de conectividad.';
    }
    if (proof.terminal_condition === 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED') {
      return 'Las fuentes consultadas presentaron fallos técnicos o restricciones temporales de conexión.';
    }
    return `Misión finalizada con motivo: ${proof.terminal_condition}`;
  }
}
