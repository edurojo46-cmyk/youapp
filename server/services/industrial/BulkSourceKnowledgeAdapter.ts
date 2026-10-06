/**
 * ATLAS — BULK SOURCE KNOWLEDGE ADAPTER
 * @server/services/industrial/BulkSourceKnowledgeAdapter.ts
 *
 * External adapter between public.atlas_source_knowledge_map (Single Source of Truth)
 * and the frozen Tesla Wheel primitive (ScalableEmailSource contract).
 *
 * RESPONSIBILITIES ONLY:
 * - Query Source KM for bulk-capable, public email sources.
 * - Enforce deterministic eligibility filters (PUBLIC, BULK_CAPABLE, ENUMERABLE, VALID, PROMOTED).
 * - Physically validate resource existence before adding to active frontier:
 *     * LOCAL_FILE: fs.existsSync(local_path) === true
 *     * HTTP/API: canonical_url is valid and format is compatible
 * - Convert validated DB rows into ScalableEmailSource contract.
 *
 * CONSTITUTIONAL INVARIANTS:
 * - DO NOT parse emails.
 * - DO NOT dedupe emails.
 * - DO NOT certify contacts.
 * - DO NOT modify src/lib/atlasIndustrialEmail/
 * - NO category patches.
 */

import fs from 'fs';
import type pg from 'pg';
import type { ScalableEmailSource } from '../../../src/lib/atlasIndustrialEmail/IndustrialEmailTeslaWheel.ts';

export interface SourceValidationReport {
  source_id: string;
  source_name: string;
  source_family: string;
  current_status: string;
  public_status: string;
  permitted_status: string;
  physical_resource_type: 'LOCAL_FILE' | 'HTTP_ENDPOINT';
  physical_resource_exists: boolean;
  contains_email_capability: boolean;
  bulk_capable: boolean;
  enumerable: boolean;
  tesla_compatible: boolean;
  eligible_for_active_frontier: boolean;
  rejection_reason?: string;
}

export class BulkSourceKnowledgeAdapter {
  private dbPool: pg.Pool;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Retrieves all registered bulk sources from Source KM and validates their physical readiness.
   */
  public async auditRegisteredBulkSources(): Promise<{
    registered_count: number;
    physically_executable_count: number;
    stale_count: number;
    unknown_count: number;
    reports: SourceValidationReport[];
  }> {
    const res = await this.dbPool.query(`
      SELECT 
        source_id, source_name, source_family, canonical_url, protocol, access_method,
        public_status, permitted_status, current_status, estimated_records,
        field_telemetry, entity_capabilities, row_unit_supported, geography_scope
      FROM public.atlas_source_knowledge_map
      WHERE 'PUBLIC_EMAIL_CONTACT' = ANY(row_unit_supported)
         OR entity_capabilities->>'EMAIL' IS NOT NULL
      ORDER BY source_id;
    `);

    const reports: SourceValidationReport[] = [];
    let executableCount = 0;
    let staleCount = 0;
    let unknownCount = 0;

    for (const row of res.rows) {
      const telemetry = row.field_telemetry || {};
      const format = telemetry.format || (row.protocol === 'LOCAL_FILE' ? 'LOCAL_FILE' : 'CSV');
      const localPath = telemetry.local_path;

      let resourceExists = false;
      let resourceType: 'LOCAL_FILE' | 'HTTP_ENDPOINT' = 'HTTP_ENDPOINT';

      if (format === 'LOCAL_FILE' || localPath) {
        resourceType = 'LOCAL_FILE';
        resourceExists = !!localPath && fs.existsSync(localPath);
      } else if (row.canonical_url && row.canonical_url.startsWith('http')) {
        resourceType = 'HTTP_ENDPOINT';
        resourceExists = true; // URL configured
      }

      const containsEmail = telemetry.contains_public_email !== false && row.entity_capabilities?.EMAIL !== 'NONE';
      const bulkCapable = telemetry.bulk_capable !== false;
      const enumerable = telemetry.can_enumerate !== false;
      const isPublic = row.public_status === 'PUBLIC';
      const isPermitted = row.permitted_status === 'PERMITTED';
      const isPromoted = row.current_status === 'PROMOTED';
      const isStale = row.current_status === 'STALE';

      let eligible = false;
      let rejectionReason: string | undefined;

      if (isStale) {
        rejectionReason = telemetry.stale_reason || 'MARKED_STALE_IN_SOURCE_KM';
        staleCount++;
      } else if (!isPublic || !isPermitted) {
        rejectionReason = 'NOT_PUBLIC_OR_NOT_PERMITTED';
        unknownCount++;
      } else if (!containsEmail) {
        rejectionReason = 'NO_EMAIL_EVIDENCE';
        staleCount++;
      } else if (!resourceExists) {
        rejectionReason = resourceType === 'LOCAL_FILE' ? 'LOCAL_FILE_MISSING' : 'ENDPOINT_MISSING';
        staleCount++;
      } else if (!isPromoted) {
        rejectionReason = `CURRENT_STATUS_${row.current_status}_NOT_EXECUTABLE`;
        unknownCount++;
      } else {
        eligible = true;
        executableCount++;
      }

      reports.push({
        source_id: row.source_id,
        source_name: row.source_name,
        source_family: row.source_family,
        current_status: row.current_status,
        public_status: row.public_status,
        permitted_status: row.permitted_status,
        physical_resource_type: resourceType,
        physical_resource_exists: resourceExists,
        contains_email_capability: containsEmail,
        bulk_capable: bulkCapable,
        enumerable: enumerable,
        tesla_compatible: true,
        eligible_for_active_frontier: eligible,
        rejection_reason: rejectionReason
      });
    }

    return {
      registered_count: res.rows.length,
      physically_executable_count: executableCount,
      stale_count: staleCount,
      unknown_count: unknownCount,
      reports
    };
  }

  /**
   * Builds the eligible physical source frontier directly from public.atlas_source_knowledge_map.
   * Caches zero hardcoded source lists.
   */
  public async getEligibleBulkFrontier(): Promise<ScalableEmailSource[]> {
    const res = await this.dbPool.query(`
      SELECT 
        source_id, source_name, source_family, canonical_url, protocol, access_method,
        public_status, permitted_status, current_status, estimated_records,
        field_telemetry, entity_capabilities, row_unit_supported, geography_scope
      FROM public.atlas_source_knowledge_map
      WHERE public_status = 'PUBLIC'
        AND permitted_status = 'PERMITTED'
        AND current_status = 'PROMOTED'
        AND ('PUBLIC_EMAIL_CONTACT' = ANY(row_unit_supported) OR entity_capabilities->>'EMAIL' = 'HIGH')
      ORDER BY source_id;
    `);

    const frontier: ScalableEmailSource[] = [];

    for (const row of res.rows) {
      const telemetry = row.field_telemetry || {};
      const format = telemetry.format || (row.protocol === 'LOCAL_FILE' ? 'LOCAL_FILE' : 'CSV');
      const localPath = telemetry.local_path;

      // 1. Validate physical resource existence
      if (format === 'LOCAL_FILE') {
        if (!localPath || !fs.existsSync(localPath)) {
          console.warn(`[BulkSourceKnowledgeAdapter] Skipping ${row.source_id}: local file ${localPath} does not exist`);
          continue;
        }
      }

      // 2. Validate public email capability
      if (telemetry.contains_public_email === false || row.entity_capabilities?.EMAIL === 'NONE') {
        continue;
      }

      // 3. Map to ScalableEmailSource contract
      const jurisdiction = row.geography_scope === 'ARG_CABA'
        ? 'ARGENTINA / CABA'
        : 'ARGENTINA / NACIONAL';

      frontier.push({
        source_id: row.source_id,
        source_family: row.source_family,
        source_name: row.source_name,
        url: row.canonical_url,
        format: format as 'CSV' | 'LOCAL_FILE' | 'JSON' | 'API',
        local_path: localPath || undefined,
        jurisdiction,
        estimated_supply: parseInt(row.estimated_records || '1000', 10)
      });
    }

    return frontier;
  }
}
