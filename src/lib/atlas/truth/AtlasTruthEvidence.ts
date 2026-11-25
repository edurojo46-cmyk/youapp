/**
 * ATLAS TRUTH GRAPH V1
 * Module: AtlasTruthEvidence.ts
 * Path: src/lib/atlas/truth/AtlasTruthEvidence.ts
 * 
 * Truth Evidence Model.
 * Represents physical proof backing an assertion.
 * 
 * Invariants:
 * - Evidence belongs to the ASSERTION, NOT just the entity.
 * - Never permit PERSON_PROVENANCE = EMAIL_PROVENANCE without explicit evidence.
 * - Links directly to Source Genome (source_id, route_id).
 */

import crypto from 'crypto';

export type EvidenceMethod =
  | 'DIRECT_EXTRACT'
  | 'REGEX_CAPTURE'
  | 'CKAN_API_RECORD'
  | 'CSV_BULK_ROW'
  | 'HTML_TABLE_CELL'
  | 'OVERPASS_TAG'
  | 'HEURISTIC_INFERENCE';

export interface TruthEvidence {
  evidence_id: string;
  assertion_id: string;
  source_id: string;
  route_id?: string;
  source_url?: string;
  observed_at: string;
  method: EvidenceMethod;
  evidence_fragment: string;
  evidence_fragment_hash: string;
  evidence_metadata?: Record<string, any>;
  environment?: 'TEST' | 'PRODUCTION';
  created_at: string;
}

export class AtlasTruthEvidenceHelper {
  public static computeFragmentHash(fragment: string): string {
    return crypto.createHash('sha256').update(fragment || '').digest('hex').substring(0, 16);
  }

  public static generateEvidenceId(assertion_id: string, source_id: string, fragment_hash: string): string {
    const raw = `${assertion_id}:${source_id}:${fragment_hash}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 12);
    return `EVD_${source_id}_${hash}`;
  }
}
