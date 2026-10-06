/**
 * ATLAS GENERIC SPATIAL PARTITION PLANNER V1
 * @server/services/industrial/SpatialPartitionPlanner.ts
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - NO category-specific hardcoding. Driven entirely by geography & spatial capabilities.
 * - Adaptive Quadtree decomposition (ROOT -> 4 CHILD BBOX).
 * - Persistent & Resumable partition state stored in PostgreSQL.
 * - Deterministic, non-overlapping subdivisions.
 * - Strict retry handling with mirrors and backoff.
 */

import type pg from 'pg';
import { SourceQueryTranslator, type BoundingBoxCoordinates } from './SourceQueryTranslator.ts';
import type { UniversalSemanticSpec } from './UniversalSemanticResolver.ts';
import { AtlasGeographyRegistry } from './AtlasGeographyRegistry.ts';

export type PartitionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'EXHAUSTED'
  | 'SPLIT'
  | 'FAILED_RETRYABLE'
  | 'FAILED_FINAL';

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
  clause: string;
}

export interface SpatialPartitionRecord {
  partition_id: string;
  parent_partition_id: string | null;
  mission_id: string;
  geography_id?: string;
  bbox: BBox;
  depth: number;
  status: PartitionStatus;
  records_scanned: number;
  records_valid: number;
  duplicates: number;
  rejected: number;
  certified_new: number;
  source_id: string;
  query_signature: string;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class SpatialPartitionPlanner {
  private static instance: SpatialPartitionPlanner;
  private dbPool: pg.Pool | null = null;
  private schemaEnsured: boolean = false;

  public static getInstance(dbPool?: pg.Pool): SpatialPartitionPlanner {
    if (!this.instance) {
      this.instance = new SpatialPartitionPlanner();
    }
    if (dbPool && !this.instance.dbPool) {
      this.instance.dbPool = dbPool;
    }
    return this.instance;
  }

  public setDbPool(dbPool: pg.Pool) {
    this.dbPool = dbPool;
  }

  public async ensureSchema(): Promise<void> {
    if (this.schemaEnsured || !this.dbPool) return;
    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_mission_partitions (
        partition_id VARCHAR(100) PRIMARY KEY,
        parent_partition_id VARCHAR(100),
        mission_id VARCHAR(100) NOT NULL,
        geography_id VARCHAR(100),
        bbox JSONB NOT NULL,
        depth INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        records_scanned INTEGER NOT NULL DEFAULT 0,
        records_valid INTEGER NOT NULL DEFAULT 0,
        duplicates INTEGER NOT NULL DEFAULT 0,
        rejected INTEGER NOT NULL DEFAULT 0,
        certified_new INTEGER NOT NULL DEFAULT 0,
        source_id VARCHAR(100) NOT NULL,
        query_signature VARCHAR(255) NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE public.atlas_mission_partitions ADD COLUMN IF NOT EXISTS geography_id VARCHAR(100);
      CREATE INDEX IF NOT EXISTS idx_mission_partitions_lookup ON public.atlas_mission_partitions(mission_id, status);
      CREATE INDEX IF NOT EXISTS idx_mission_partitions_signature ON public.atlas_mission_partitions(mission_id, query_signature);
    `);
    this.schemaEnsured = true;
  }

  /**
   * Helper to format BBox with 4 decimal precision
   */
  public formatBBox(south: number, west: number, north: number, east: number): BBox {
    const s = Number(south.toFixed(4));
    const w = Number(west.toFixed(4));
    const n = Number(north.toFixed(4));
    const e = Number(east.toFixed(4));
    return {
      south: s,
      west: w,
      north: n,
      east: e,
      clause: `(${s},${w},${n},${e})`
    };
  }

  /**
   * Subdivides a Bounding Box into 4 deterministic Quadtree quadrants (NW, NE, SW, SE)
   */
  public subdivideQuadtree(bbox: BBox): { nw: BBox; ne: BBox; sw: BBox; se: BBox } {
    const midLat = (bbox.south + bbox.north) / 2;
    const midLon = (bbox.west + bbox.east) / 2;

    return {
      nw: this.formatBBox(midLat, bbox.west, bbox.north, midLon),
      ne: this.formatBBox(midLat, midLon, bbox.north, bbox.east),
      sw: this.formatBBox(bbox.south, bbox.west, midLat, midLon),
      se: this.formatBBox(bbox.south, midLon, midLat, bbox.east)
    };
  }

  /**
   * Initializes or resumes spatial partitions for a mission
   */
  public async initializePartitions(
    missionId: string,
    spec: UniversalSemanticSpec,
    sourceId: string,
    targetLimit: number
  ): Promise<SpatialPartitionRecord[]> {
    await this.ensureSchema();
    if (!this.dbPool) throw new Error('DB_POOL_NOT_CONFIGURED');

    // 1. Check if partitions already exist for this mission (Resume capability)
    const existingRes = await this.dbPool.query(
      `SELECT * FROM public.atlas_mission_partitions WHERE mission_id = $1 ORDER BY depth ASC, partition_id ASC;`,
      [missionId]
    );

    if (existingRes.rows.length > 0) {
      console.log(`[SpatialPartitionPlanner] Resuming ${existingRes.rows.length} existing partitions for mission ${missionId}`);
      // Reset any stuck RUNNING partitions to PENDING
      await this.dbPool.query(
        `UPDATE public.atlas_mission_partitions SET status = 'PENDING', updated_at = NOW() WHERE mission_id = $1 AND status = 'RUNNING';`,
        [missionId]
      );
      const reloaded = await this.dbPool.query(
        `SELECT * FROM public.atlas_mission_partitions WHERE mission_id = $1 ORDER BY depth ASC, partition_id ASC;`,
        [missionId]
      );
      return reloaded.rows;
    }

    // 2. Generate root Bounding Box from canonical geography (Fail-closed invariant)
    const geoRegistry = AtlasGeographyRegistry.getInstance();
    const canonicalGeo = geoRegistry.resolveCanonicalGeography(spec.geography);
    if (!canonicalGeo) {
      throw new Error(`GEOGRAPHY_CONTRACT_VIOLATION: Unresolved or unsupported spatial geography '${spec.geography || 'EMPTY'}'. Cannot initialize spatial partitions.`);
    }

    const rootBBox = this.formatBBox(canonicalGeo.bbox.south, canonicalGeo.bbox.west, canonicalGeo.bbox.north, canonicalGeo.bbox.east);
    const querySignature = `${spec.category || 'ESTABLISHMENT'}::${canonicalGeo.geography_id}::${rootBBox.clause}`;

    // For multi-partition acquisition, initialize depth 0 as SPLIT and create 4 depth 1 quadrants (NW, NE, SW, SE)
    const rootId = `${missionId}_p_root`;
    const quadrants = this.subdivideQuadtree(rootBBox);

    const quadEntries: Array<{ id: string; bbox: BBox; quadrant: string }> = [
      { id: `${missionId}_p_d1_nw`, bbox: quadrants.nw, quadrant: 'NW' },
      { id: `${missionId}_p_d1_ne`, bbox: quadrants.ne, quadrant: 'NE' },
      { id: `${missionId}_p_d1_sw`, bbox: quadrants.sw, quadrant: 'SW' },
      { id: `${missionId}_p_d1_se`, bbox: quadrants.se, quadrant: 'SE' }
    ];

    // Insert root (SPLIT)
    await this.dbPool.query(`
      INSERT INTO public.atlas_mission_partitions (
        partition_id, parent_partition_id, mission_id, geography_id, bbox, depth, status,
        source_id, query_signature, created_at, updated_at
      ) VALUES ($1, NULL, $2, $3, $4, 0, 'SPLIT', $5, $6, NOW(), NOW());
    `, [rootId, missionId, canonicalGeo.geography_id, JSON.stringify(rootBBox), sourceId, querySignature]);

    // Insert 4 depth 1 quadrants (PENDING)
    for (const q of quadEntries) {
      const qSig = `${spec.category || 'ESTABLISHMENT'}::${canonicalGeo.geography_id}::${q.bbox.clause}`;
      await this.dbPool.query(`
        INSERT INTO public.atlas_mission_partitions (
          partition_id, parent_partition_id, mission_id, geography_id, bbox, depth, status,
          source_id, query_signature, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 1, 'PENDING', $6, $7, NOW(), NOW());
      `, [q.id, rootId, missionId, canonicalGeo.geography_id, JSON.stringify(q.bbox), sourceId, qSig]);
    }

    const createdRes = await this.dbPool.query(
      `SELECT * FROM public.atlas_mission_partitions WHERE mission_id = $1 ORDER BY depth ASC, partition_id ASC;`,
      [missionId]
    );
    console.log(`[SpatialPartitionPlanner] Initialized 1 root (${canonicalGeo.geography_id} SPLIT) + 4 child quadrants (PENDING) for mission ${missionId}`);
    return createdRes.rows;
  }

  /**
   * Retrieves the next pending or retryable partition
   */
  public async getNextPartition(missionId: string): Promise<SpatialPartitionRecord | null> {
    if (!this.dbPool) return null;
    const res = await this.dbPool.query(`
      SELECT * FROM public.atlas_mission_partitions
      WHERE mission_id = $1 AND (status = 'PENDING' OR status = 'FAILED_RETRYABLE')
      ORDER BY depth ASC, retry_count ASC, partition_id ASC
      LIMIT 1;
    `, [missionId]);

    return res.rows[0] || null;
  }

  /**
   * Marks a partition as RUNNING
   */
  public async markRunning(partitionId: string): Promise<void> {
    if (!this.dbPool) return;
    await this.dbPool.query(`
      UPDATE public.atlas_mission_partitions
      SET status = 'RUNNING', updated_at = NOW()
      WHERE partition_id = $1;
    `, [partitionId]);
  }

  /**
   * Marks a partition as EXHAUSTED with its scan counts
   */
  public async markExhausted(
    partitionId: string,
    counts: { scanned: number; valid: number; duplicates: number; rejected: number; certified: number }
  ): Promise<void> {
    if (!this.dbPool) return;
    await this.dbPool.query(`
      UPDATE public.atlas_mission_partitions
      SET status = 'EXHAUSTED',
          records_scanned = $1,
          records_valid = $2,
          duplicates = $3,
          rejected = $4,
          certified_new = $5,
          updated_at = NOW()
      WHERE partition_id = $6;
    `, [counts.scanned, counts.valid, counts.duplicates, counts.rejected, counts.certified, partitionId]);
  }

  /**
   * Splits a dense partition into 4 child sub-partitions (depth + 1)
   */
  public async splitPartition(
    partition: SpatialPartitionRecord,
    category: string,
    maxDepth: number = 3
  ): Promise<SpatialPartitionRecord[]> {
    if (!this.dbPool) return [];
    if (partition.depth >= maxDepth) {
      console.log(`[SpatialPartitionPlanner] Partition ${partition.partition_id} reached max depth ${maxDepth}, cannot split further.`);
      return [];
    }

    const quadrants = this.subdivideQuadtree(partition.bbox);
    const nextDepth = partition.depth + 1;

    // Mark current as SPLIT
    await this.dbPool.query(`
      UPDATE public.atlas_mission_partitions
      SET status = 'SPLIT', updated_at = NOW()
      WHERE partition_id = $1;
    `, [partition.partition_id]);

    const quadEntries = [
      { id: `${partition.partition_id}_nw`, bbox: quadrants.nw },
      { id: `${partition.partition_id}_ne`, bbox: quadrants.ne },
      { id: `${partition.partition_id}_sw`, bbox: quadrants.sw },
      { id: `${partition.partition_id}_se`, bbox: quadrants.se }
    ];

    const created: SpatialPartitionRecord[] = [];
    for (const q of quadEntries) {
      const qSig = `${category}::${partition.geography_id || 'GEO'}::${q.bbox.clause}`;
      const res = await this.dbPool.query(`
        INSERT INTO public.atlas_mission_partitions (
          partition_id, parent_partition_id, mission_id, geography_id, bbox, depth, status,
          source_id, query_signature, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, NOW(), NOW())
        RETURNING *;
      `, [q.id, partition.partition_id, partition.mission_id, partition.geography_id || null, JSON.stringify(q.bbox), nextDepth, partition.source_id, qSig]);
      created.push(res.rows[0]);
    }

    console.log(`[SpatialPartitionPlanner] Partition ${partition.partition_id} SPLIT into 4 depth-${nextDepth} children.`);
    return created;
  }

  /**
   * Marks a partition as FAILED_RETRYABLE or FAILED_FINAL
   */
  public async recordFailure(partitionId: string, error: string): Promise<void> {
    if (!this.dbPool) return;
    const pRes = await this.dbPool.query(`SELECT retry_count FROM public.atlas_mission_partitions WHERE partition_id = $1;`, [partitionId]);
    const retryCount = (pRes.rows[0]?.retry_count || 0) + 1;
    const nextStatus: PartitionStatus = retryCount >= 3 ? 'FAILED_FINAL' : 'FAILED_RETRYABLE';

    await this.dbPool.query(`
      UPDATE public.atlas_mission_partitions
      SET status = $1, retry_count = $2, last_error = $3, updated_at = NOW()
      WHERE partition_id = $4;
    `, [nextStatus, retryCount, error, partitionId]);
  }

  /**
   * Retrieves summary metrics of all partitions for a mission
   */
  public async getMissionPartitionSummary(missionId: string): Promise<{
    total_partitions: number;
    pending_count: number;
    running_count: number;
    exhausted_count: number;
    split_count: number;
    failed_count: number;
    partitions_scanned: number;
  }> {
    if (!this.dbPool) {
      return { total_partitions: 0, pending_count: 0, running_count: 0, exhausted_count: 0, split_count: 0, failed_count: 0, partitions_scanned: 0 };
    }

    const res = await this.dbPool.query(`
      SELECT status, COUNT(*) as count
      FROM public.atlas_mission_partitions
      WHERE mission_id = $1
      GROUP BY status;
    `, [missionId]);

    const counts: Record<string, number> = {};
    for (const r of res.rows) {
      counts[r.status] = Number(r.count);
    }

    const pending = counts['PENDING'] || 0;
    const running = counts['RUNNING'] || 0;
    const exhausted = counts['EXHAUSTED'] || 0;
    const split = counts['SPLIT'] || 0;
    const failed = (counts['FAILED_RETRYABLE'] || 0) + (counts['FAILED_FINAL'] || 0);

    return {
      total_partitions: pending + running + exhausted + split + failed,
      pending_count: pending,
      running_count: running,
      exhausted_count: exhausted,
      split_count: split,
      failed_count: failed,
      partitions_scanned: exhausted
    };
  }
}
